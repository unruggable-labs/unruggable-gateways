import { encodeAbiParameters, toHex } from 'viem';
import { getStorageAt } from 'viem/actions';

import { CachedMap } from '../cached.js';
import type { EncodedProof, HexAddress, HexString } from '../types.js';
import {
  AbstractProver,
  makeStorageKey,
  storageMapFromCache,
  type Need,
  type ProofSequence,
} from '../vm.js';
import type {
  RPCZKSyncGetProof,
  ZKSyncClient,
  ZKSyncStorageProof,
} from './types.js';

// https://docs.zksync.io/build/api-reference/zks-rpc#zks_getproof
// https://github.com/matter-labs/era-contracts/blob/fd4aebcfe8833b26e096e87e142a5e7e4744f3fa/system-contracts/bootloader/bootloader.yul#L458
export const ZKSYNC_ACCOUNT_CODEHASH =
  '0x0000000000000000000000000000000000008002' as const;

function encodeStorageProof(proof: ZKSyncStorageProof) {
  return encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint64' }, { type: 'bytes32[]' }],
    [proof.value, BigInt(proof.index), proof.proof]
  );
}

export class ZKSyncProver extends AbstractProver {
  static async latest(client2: ZKSyncClient) {
    return new this(
      client2,
      await client2
        .request({ method: 'zks_L1BatchNumber', params: [] })
        .then((x) => Number(x))
    );
  }
  constructor(
    readonly client2: ZKSyncClient,
    readonly batchIndex: number,
    readonly cache: CachedMap<string> = new CachedMap()
  ) {
    super();
  }
  storageMap() {
    return storageMapFromCache(this.cache);
  }
  override async isContract(target: HexAddress): Promise<boolean> {
    const storageProof: ZKSyncStorageProof | undefined =
      await this.cache.peek(target);
    const codeHash = storageProof
      ? storageProof.value
      : await this.getStorage(ZKSYNC_ACCOUNT_CODEHASH, BigInt(target));
    return !/^0x0+$/.test(codeHash);
  }
  override async getStorage(
    target: HexAddress,
    slot: bigint
  ): Promise<HexString> {
    const storageKey = makeStorageKey(target, slot);
    const storageProof = await (this.useFastCalls
      ? this.cache.peek<ZKSyncStorageProof>(storageKey)
      : this.cache.get(storageKey, async () => {
          const vs = await this.getStorageProofs(target, [slot]);
          return vs[0];
        }));
    if (storageProof) {
      return storageProof.value;
    }
    return this.cache.get<HexString>(
      storageKey + '!',
      () =>
        getStorageAt(this.client2, {
          address: target,
          slot: toHex(slot),
        }) as Promise<HexString>,
      this.fastCallCacheMs
    );
  }
  override async prove(needs: Need[]): Promise<ProofSequence> {
    type Ref = { id: number; proof: EncodedProof };
    const targets = new Map<HexString, Map<bigint, Ref>>();
    const refs: Ref[] = [];
    let nullRef: Ref | undefined;
    const createRef = () => {
      const ref = { id: refs.length, proof: '0x' } as const;
      refs.push(ref);
      return ref;
    };
    const order = needs.map(([target, slot]) => {
      if (slot === false) {
        // accountProof that isn't used
        // save 12m gas by not including a proof
        if (!nullRef) nullRef = createRef();
        return nullRef.id;
      }
      if (slot === true) {
        slot = BigInt(target);
        target = ZKSYNC_ACCOUNT_CODEHASH;
      }
      let bucket = targets.get(target);
      if (!bucket) {
        bucket = new Map();
        targets.set(target, bucket);
      }
      let ref = bucket.get(slot);
      if (!ref) {
        ref = createRef();
        bucket.set(slot, ref);
      }
      return ref.id;
    });
    await Promise.all(
      Array.from(targets, async ([target, map]) => {
        const m = [...map];
        const proofs = await this.getStorageProofs(
          target,
          m.map(([slot]) => slot)
        );
        m.forEach(([, ref], i) => (ref.proof = encodeStorageProof(proofs[i])));
      })
    );
    return {
      proofs: refs.map((x) => x.proof),
      order: Uint8Array.from(order),
    };
  }
  async getStorageProofs(target: HexString, slots: bigint[]) {
    const missing: number[] = [];
    const { promise, resolve, reject } = Promise.withResolvers();
    const storageProofs: (
      | Promise<ZKSyncStorageProof>
      | ZKSyncStorageProof
      | undefined
    )[] = slots.map((slot, i) => {
      const key = makeStorageKey(target, slot);
      const p = this.cache.peek<ZKSyncStorageProof>(key);
      if (!p) {
        this.cache.set(
          key,
          promise.then(() => storageProofs[i])
        );
        missing.push(i);
      }
      return p;
    });
    if (missing.length) {
      try {
        const vs = await this.fetchStorageProofs(
          target,
          missing.map((x) => slots[x])
        );
        missing.forEach((x, i) => (storageProofs[x] = vs[i]));
        resolve();
      } catch (err) {
        reject(err);
        throw err;
      }
    }
    return Promise.all(storageProofs) as Promise<ZKSyncStorageProof[]>;
  }
  async fetchStorageProofs(
    target: HexString,
    slots: bigint[]
  ): Promise<ZKSyncStorageProof[]> {
    const ps: Promise<RPCZKSyncGetProof>[] = [];
    for (let i = 0; i < slots.length; ) {
      ps.push(
        this.client2.request({
          method: 'zks_getProof',
          params: [
            target,
            slots
              .slice(i, (i += this.proofBatchSize))
              .map((slot) => toHex(slot, { size: 32 })),
            this.batchIndex,
          ],
        })
      );
    }
    const vs = await Promise.all(ps);
    return vs.flatMap((x) => x.storageProof);
  }
}
