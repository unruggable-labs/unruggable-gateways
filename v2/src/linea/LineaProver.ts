import {
  encodeAbiParameters,
  parseAbiParameters,
  sliceHex,
  toHex,
  zeroHash,
} from 'viem';
import { getStorageAt } from 'viem/actions';

import { CachedMap } from '../cached.js';
import type { EncodedProof, HexString } from '../types.js';
import { NULL_CODE_HASH } from '../utils.js';
import {
  AbstractProver,
  makeStorageKey,
  storageMapFromCache,
  type Need,
} from '../vm.js';
import type { LineaClient, LineaProof, RPCLineaGetProof } from './types.js';

//const NULL_CODE_HASH = '0x0134373b65f439c874734ff51ea349327c140cde2e47a933146e6f9f2ad8eb17'; // mimc(ZeroHash)

function isExistanceProof(proof: LineaProof) {
  return 'leafIndex' in proof;
}

function isContract(accountProof: LineaProof) {
  return (
    isExistanceProof(accountProof) &&
    // https://github.com/Consensys/linea-monorepo/blob/a001342170768a22988a29b2dca8601199c6e205/contracts/contracts/lib/SparseMerkleProof.sol#L23
    sliceHex(accountProof.proof.value, 128, 160) !== NULL_CODE_HASH
  );
}

function encodeProof(proof: LineaProof) {
  return encodeAbiParameters(
    parseAbiParameters('(uint256, bytes, bytes[])[]'),
    [
      isExistanceProof(proof)
        ? [
            [
              BigInt(proof.leafIndex),
              proof.proof.value,
              proof.proof.proofRelatedNodes,
            ],
          ]
        : [
            [
              BigInt(proof.leftLeafIndex),
              proof.leftProof.value,
              proof.leftProof.proofRelatedNodes,
            ],
            [
              BigInt(proof.rightLeafIndex),
              proof.rightProof.value,
              proof.rightProof.proofRelatedNodes,
            ],
          ],
    ]
  );
}

export class LineaProver extends AbstractProver {
  constructor(
    readonly client: LineaClient,
    readonly block: HexString,
    readonly cache: CachedMap<string> = new CachedMap()
  ) {
    super();
  }
  storageMap() {
    return storageMapFromCache(this.cache);
  }
  override async getStorage(
    target: HexString,
    slot: bigint
  ): Promise<HexString> {
    // check to see if we know this target isn't a contract
    const accountProof = await this.cache.peek<LineaProof>(target);
    if (accountProof && !isContract(accountProof)) {
      return zeroHash;
    }
    // check to see if we've already have a proof for this value
    const storageKey = makeStorageKey(target, slot);
    const storageProof = await this.cache.peek<LineaProof>(storageKey);
    if (storageProof) {
      return isExistanceProof(storageProof)
        ? storageProof.proof.value
        : zeroHash;
    }
    // we didn't have the proof
    if (this.useFastCalls) {
      return this.cache.get(
        storageKey + '!',
        () =>
          getStorageAt(this.client, {
            address: target,
            slot: toHex(slot),
          }) as Promise<HexString>,
        this.fastCallCacheMs
      );
    } else {
      const proof = await this.getProofs(target, [slot]);
      return isContract(proof.accountProof) &&
        isExistanceProof(proof.storageProofs[0])
        ? proof.storageProofs[0].proof.value
        : zeroHash;
    }
  }
  override async isContract(target: HexString) {
    const { accountProof } = await this.getProofs(target);
    return isContract(accountProof);
  }
  override async prove(needs: Need[]) {
    // reduce an ordered list of needs into a deduplicated list of proofs
    // minimize calls to eth_getProof
    // provide empty proofs for non-contract slots
    type Ref = { id: number; proof: EncodedProof };
    type RefMap = Ref & { map: Map<bigint, Ref> };
    const targets = new Map<HexString, RefMap>();
    const refs: Ref[] = [];
    const order = needs.map(([target, slot]) => {
      let bucket = targets.get(target);
      if (typeof slot === 'boolean') {
        // accountProof
        // we must prove this value since it leads to a stateRoot
        if (!bucket) {
          bucket = { id: refs.length, proof: '0x', map: new Map() };
          refs.push(bucket);
          targets.set(target, bucket);
        }
        return bucket.id;
      } else {
        // storageProof (for targeted account)
        // bucket can be undefined if a slot is read without a target
        // this is okay because the initial machine state is NOT_A_CONTRACT
        let ref = bucket?.map.get(slot);
        if (!ref) {
          ref = { id: refs.length, proof: '0x' };
          refs.push(ref);
          bucket?.map.set(slot, ref);
        }
        return ref.id;
      }
    });
    if (refs.length > this.maxUniqueProofs) {
      throw new Error(
        `too many proofs: ${refs.length} > ${this.maxUniqueProofs}`
      );
    }
    await Promise.all(
      Array.from(targets, async ([target, bucket]) => {
        let m = [...bucket.map];
        try {
          const accountProof = await this.cache.cachedValue<LineaProof>(target);
          if (accountProof && !isContract(accountProof)) {
            m = []; // if we know target isn't a contract, we only need accountProof
          }
        } catch (err) {
          /*empty*/
        }
        const proofs = await this.getProofs(
          target,
          m.map(([slot]) => slot)
        );
        bucket.proof = encodeProof(proofs.accountProof);
        if (isContract(proofs.accountProof)) {
          m.forEach(
            ([, ref], i) => (ref.proof = encodeProof(proofs.storageProofs[i]))
          );
        }
      })
    );
    return {
      proofs: refs.map((x) => x.proof),
      order: Uint8Array.from(order),
    };
  }
  async getProofs(
    target: HexString,
    slots: bigint[] = []
  ): Promise<RPCLineaGetProof> {
    target = target.toLowerCase() as HexString;
    // there are (3) cases:
    // 1.) account doesn't exist
    // 2.) account is EOA
    // 3.) account is contract
    const missing: number[] = [];
    const { promise, resolve, reject } = Promise.withResolvers();
    // check if we have an account proof
    let accountProof: Promise<LineaProof> | LineaProof | undefined =
      this.cache.peek<LineaProof>(target);
    if (!accountProof) {
      // missing account proof, so block it
      this.cache.set(
        target,
        promise.then(() => accountProof),
        0
      );
    }
    // check if we're missing any slots
    const storageProofs: (Promise<LineaProof> | LineaProof | undefined)[] =
      slots.map((slot, i) => {
        const key = makeStorageKey(target, slot);
        const p = this.cache.peek<LineaProof>(key);
        if (!p) {
          // missing storage proof, so block it
          this.cache.set(
            key,
            promise.then(() => storageProofs[i]),
            0
          );
          missing.push(i);
        }
        return p;
      });
    // check if we need something
    if (!accountProof || missing.length) {
      try {
        const { storageProofs: v, accountProof: a } = await this.fetchProofs(
          target,
          missing.map((x) => slots[x])
        );
        // update the blocked values
        accountProof = a;
        missing.forEach((x, i) => (storageProofs[x] = v[i]));
        resolve();
        // refresh all cache expirations
        this.cache.set(target, a);
        if (isContract(accountProof)) {
          slots.forEach((slot, i) => {
            this.cache.set(makeStorageKey(target, slot), storageProofs[i]);
          });
        }
      } catch (err) {
        reject(err);
        throw err; // must throw because accountProof is undefined
      }
    } else {
      accountProof = await accountProof;
    }
    // nuke the proofs if we dont exist
    if (!isContract(accountProof)) {
      storageProofs.length = 0;
    }
    // reassemble
    return {
      accountProof,
      storageProofs: (await Promise.all(storageProofs)) as LineaProof[],
    };
  }
  async fetchProofs(target: HexString, slots: bigint[] = []) {
    const ps: Promise<RPCLineaGetProof>[] = [];
    for (let i = 0; ; ) {
      ps.push(
        this.client.request({
          method: 'linea_getProof',
          params: [
            target,
            slots
              .slice(i, (i += this.proofBatchSize))
              .map((slot) => toHex(slot, { size: 32 })),
            this.block,
          ],
        })
      );
      if (i >= slots.length) break;
    }
    const vs = await Promise.all(ps);
    for (let i = 1; i < vs.length; i++) {
      vs[0].storageProofs.push(...vs[i].storageProofs);
    }
    return vs[0];
  }
}
