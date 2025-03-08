import type {
  Provider,
  HexAddress,
  HexString,
  HexString32,
  BigNumberish,
  ProofRef,
  ProofSequence,
} from '../types.js';
import {
  type RPCZKSyncGetProof,
  type ZKSyncStorageProof,
  RPCZKSyncL1BatchDetails,
  encodeProof,
} from './types.js';
import {
  AbstractProver,
  isTargetNeed,
  makeStorageKey,
  type Need,
} from '../vm.js';
import { ZeroAddress, ZeroHash } from 'ethers/constants';
import {
  LATEST_BLOCK_TAG,
  isBlockTag,
  toPaddedHex,
  withResolvers,
} from '../utils.js';
import { unwrap } from '../wrap.js';

// https://docs.zksync.io/build/api-reference/zks-rpc#zks_getproof
// https://github.com/matter-labs/era-contracts/blob/fd4aebcfe8833b26e096e87e142a5e7e4744f3fa/system-contracts/bootloader/bootloader.yul#L458
export const ZKSYNC_ACCOUNT_CODEHASH =
  '0x0000000000000000000000000000000000008002';

// zksync proofs are relative to a *batch* not a *block*
export class ZKSyncProver extends AbstractProver {
  static readonly encodeProof = encodeProof;
  static async latestBatchIndex(
    provider: Provider,
    relBlockTag: BigNumberish = LATEST_BLOCK_TAG
  ): Promise<number> {
    // https://docs.zksync.io/build/api-reference/zks-rpc#zks_l1batchnumber
    // NOTE: BlockTags are not supported
    // we could simulate "finalized" using some fixed offset
    // currently: any block tag => "latest"
    if (isBlockTag(relBlockTag)) {
      relBlockTag = 0;
    } else {
      relBlockTag = Number(relBlockTag);
      if (relBlockTag >= 0) return relBlockTag;
    }
    const batchIndex = Number(await provider.send('zks_L1BatchNumber', []));
    return batchIndex + relBlockTag;
  }
  static async latest(
    provider: Provider,
    relBlockTag: BigNumberish = LATEST_BLOCK_TAG
  ) {
    return new this(
      provider,
      await this.latestBatchIndex(provider, relBlockTag)
    );
  }
  constructor(
    provider: Provider,
    readonly batchIndex: number
  ) {
    super(provider);
  }
  override get context() {
    return `batch=${this.batchIndex}`;
  }
  async fetchBatchDetails(): Promise<
    Omit<RPCZKSyncL1BatchDetails, 'rootHash'> & { rootHash: HexString32 }
  > {
    // https://docs.zksync.io/build/api-reference/zks-rpc#zks_getl1batchdetails
    const json = await this.provider.send('zks_getL1BatchDetails', [
      this.batchIndex,
    ]);
    if (!json) throw new Error(`no batch: ${this.batchIndex}`);
    if (!json.rootHash) throw new Error(`unprovable batch: ${this.batchIndex}`);
    return json;
  }
  override async fetchStateRoot() {
    return (await this.fetchBatchDetails()).rootHash;
  }
  override async isContract(target: HexAddress): Promise<boolean> {
    const storageProof: ZKSyncStorageProof | undefined =
      await this.proofLRU.touch(target.toLowerCase());
    const codeHash = storageProof
      ? storageProof.value
      : await this.getStorage(ZKSYNC_ACCOUNT_CODEHASH, BigInt(target));
    return !/^0x0+$/.test(codeHash);
  }
  override async getStorage(
    target: HexAddress,
    slot: bigint,
    fast: boolean = this.fast
  ): Promise<HexString> {
    target = target.toLowerCase();
    const storageKey = makeStorageKey(target, slot);
    const storageProof: ZKSyncStorageProof | undefined =
      await this.proofLRU.touch(storageKey);
    if (storageProof) {
      return storageProof.value;
    }
    if (fast) {
      return this.cache.get(storageKey, () => {
        return this.provider.getStorage(target, slot);
      });
    }
    const vs = await this.getStorageProofs(target, [slot]);
    return vs.length ? toPaddedHex(vs[0].value) : ZeroHash;
  }
  override async prove(needs: Need[]): Promise<ProofSequence> {
    const promises: Promise<void>[] = [];
    const buckets = new Map<HexAddress, Map<bigint, ProofRef>>();
    const refs: ProofRef[] = [];
    let nullRef: ProofRef | undefined;
    const createRef = () => {
      const ref = { id: refs.length, proof: '0x' };
      refs.push(ref);
      return ref;
    };
    const addSlot = (target: HexAddress, slot: bigint) => {
      if (target === ZeroAddress) return (nullRef ??= createRef());
      let bucket = buckets.get(target);
      if (!bucket) {
        bucket = new Map();
        buckets.set(target, bucket);
      }
      let ref = bucket.get(slot);
      if (!ref) {
        ref = createRef();
        bucket.set(slot, ref);
      }
      return ref;
    };
    let target = ZeroAddress;
    const order = needs.map((need) => {
      if (isTargetNeed(need)) {
        // codehash for contract A is not stored in A
        // it is stored in the global codehash contract
        target = need.target;
        return addSlot(
          need.required ? ZKSYNC_ACCOUNT_CODEHASH : ZeroAddress,
          BigInt(need.target)
        );
      } else if (typeof need === 'bigint') {
        return addSlot(target, need);
      } else {
        const ref = createRef();
        promises.push(
          (async () => {
            ref.proof = await unwrap(need.value);
          })()
        );
        return ref;
      }
    });
    this.checkProofCount(refs.length);
    await Promise.all(
      promises.concat(
        Array.from(buckets, async ([target, map]) => {
          const m = [...map];
          const proofs = await this.getStorageProofs(
            target,
            m.map(([slot]) => slot)
          );
          m.forEach(([, ref], i) => (ref.proof = encodeProof(proofs[i])));
        })
      )
    );
    return {
      proofs: refs.map((x) => x.proof),
      order: Uint8Array.from(order, (x) => x.id),
    };
  }
  async getStorageProofs(
    target: HexString,
    slots: bigint[]
  ): Promise<ZKSyncStorageProof[]> {
    target = target.toLowerCase();
    const missing: number[] = [];
    const { promise, resolve, reject } = withResolvers();
    const storageProofs: (
      | Promise<ZKSyncStorageProof>
      | ZKSyncStorageProof
      | undefined
    )[] = slots.map((slot, i) => {
      const key = makeStorageKey(target, slot);
      const p = this.proofLRU.touch(key);
      if (!p) {
        this.proofLRU.setFuture(
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
    // 20241112: assume that the rpc is correct
    // any missing storage proof implies the account is not a contract
    // otherwise, we need another proof to perform this check
    const v = await Promise.all(storageProofs);
    this.checkStorageProofs(
      v.every((x) => x),
      slots,
      v
    );
    return v as ZKSyncStorageProof[];
  }
  async fetchStorageProofs(
    target: HexString,
    slots: bigint[]
  ): Promise<ZKSyncStorageProof[]> {
    const ps: Promise<RPCZKSyncGetProof>[] = [];
    for (let i = 0; i < slots.length; ) {
      ps.push(
        this.provider.send('zks_getProof', [
          target,
          slots
            .slice(i, (i += this.proofBatchSize))
            .map((slot) => toPaddedHex(slot)),
          this.batchIndex,
        ])
      );
    }
    const vs = await Promise.all(ps);
    return vs.flatMap((x) => x.storageProof);
  }
}
