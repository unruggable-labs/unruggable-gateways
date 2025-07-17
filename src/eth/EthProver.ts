import type { HexAddress, HexString, ProofRef } from '../types.js';
import {
  type EthAccountProof,
  type EthStorageProof,
  type RPCEthGetProof,
  isContract,
  encodeProof,
  EMPTY_STORAGE_HASH,
} from './types.js';
import { BlockProver, makeStorageKey, type TargetNeed } from '../vm.js';
import { ZeroHash } from 'ethers/constants';
import { withResolvers, toPaddedHex, fetchStorage } from '../utils.js';

export class EthProver extends BlockProver {
  static readonly EMPTY_STORAGE_HASH = EMPTY_STORAGE_HASH;
  static readonly encodeProof = encodeProof;
  static readonly isContract = isContract;
  static readonly latest = this._createLatest();
  override async isContract(target: HexAddress): Promise<boolean> {
    target = target.toLowerCase();
    if (this.fast) {
      return this.cache.get(target, async (a) => {
        // note: this actually reverts when the block is bad
        // eg. {"code": -32602, "message": "Unknown block number"}
        const code = await this.provider.getCode(a, this.block);
        return code.length > 2;
      });
    }
    return isContract(await this.getProofs(target));
  }
  override async getStorage(
    target: HexAddress,
    slot: bigint,
    fast: boolean = this.fast
  ): Promise<HexString> {
    target = target.toLowerCase();
    // check to see if we know this target isn't a contract without invoking provider
    // this is almost equivalent to: await isContract(target)
    const accountProof: EthAccountProof | undefined =
      await this.proofLRU.touch(target);
    if (accountProof && !isContract(accountProof)) {
      return ZeroHash;
    }
    // check to see if we've already have a proof for this value
    const storageKey = makeStorageKey(target, slot);
    const storageProof: EthStorageProof | undefined =
      await this.proofLRU.touch(storageKey);
    if (storageProof) {
      return toPaddedHex(storageProof.value);
    }
    if (fast) {
      return this.cache.get(storageKey, () => {
        return fetchStorage(this.provider, target, slot, this.block);
      });
    }
    const proofs = await this.getProofs(target, [slot]);
    return isContract(proofs, true)
      ? toPaddedHex(proofs.storageProof[0].value)
      : ZeroHash;
  }
  protected override async _proveNeed(
    need: TargetNeed,
    accountRef: ProofRef,
    slotRefs: Map<bigint, ProofRef>
  ) {
    const m = [...slotRefs];
    const accountProof: EthAccountProof | undefined = await this.proofLRU.peek(
      need.target
    );
    if (accountProof && !isContract(accountProof, true)) m.length = 0;
    const proofs = await this.getProofs(
      need.target,
      m.map(([slot]) => slot)
    );
    accountRef.proof = encodeProof(proofs.accountProof);
    if (isContract(proofs, true)) {
      m.forEach(
        ([, ref], i) => (ref.proof = encodeProof(proofs.storageProof[i].proof))
      );
    }
  }
  async getProofs(
    target: HexAddress,
    slots: bigint[] = []
  ): Promise<RPCEthGetProof> {
    target = target.toLowerCase();
    const missing: number[] = []; // indices of slots we don't have proofs for
    const { promise, resolve, reject } = withResolvers(); // create a blocker
    // 20240708: must setup blocks before await
    let accountProof: Promise<EthAccountProof> | EthAccountProof | undefined =
      this.proofLRU.touch(target);
    if (!accountProof) {
      // missing account proof, so block it
      this.proofLRU.setFuture(
        target,
        promise.then(() => accountProof)
      );
    }
    // check if we're missing any slots
    const storageProofs: (
      | Promise<EthStorageProof>
      | EthStorageProof
      | undefined
    )[] = slots.map((slot, i) => {
      const key = makeStorageKey(target, slot);
      const p = this.proofLRU.touch(key);
      if (!p) {
        // missing storage proof, so block it
        this.proofLRU.setFuture(
          key,
          promise.then(() => storageProofs[i])
        );
        missing.push(i);
      }
      return p;
    });
    // check if we need something
    if (!accountProof || missing.length) {
      try {
        const { storageProof: v, ...a } = await this.fetchProofs(
          target,
          missing.map((x) => slots[x])
        );
        // update cache
        accountProof = a;
        missing.forEach((x, i) => (storageProofs[x] = v[i]));
        resolve(); // unblock
      } catch (err) {
        reject(err);
        throw err;
      }
    }
    // reassemble
    const [a, v] = await Promise.all([
      accountProof,
      Promise.all(storageProofs),
    ]);
    this.checkStorageProofs(isContract(a), slots, v);
    return { storageProof: v as EthStorageProof[], ...a };
  }
  async fetchProofs(
    target: HexAddress,
    slots: bigint[] = []
  ): Promise<RPCEthGetProof> {
    const ps: Promise<RPCEthGetProof>[] = [];
    for (let i = 0; ; ) {
      ps.push(
        this.provider.send('eth_getProof', [
          target,
          slots
            .slice(i, (i += this.proofBatchSize))
            .map((slot) => toPaddedHex(slot)),
          this.block,
        ])
      );
      if (i >= slots.length) break;
    }
    const vs = await Promise.all(ps);
    // note: this returns null when block is bad
    if (!vs[0]) throw new Error(`unprovable block: ${this.block}`);
    for (let i = 1; i < vs.length; i++) {
      vs[0].storageProof.push(...vs[i].storageProof);
    }
    return vs[0];
  }
}
