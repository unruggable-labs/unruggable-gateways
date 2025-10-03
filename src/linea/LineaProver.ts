import type { HexString, HexString32, ProofRef } from '../types.js';
import { BlockProver, makeStorageKey, type TargetNeed } from '../vm.js';
import { ZeroAddress, ZeroHash } from 'ethers/constants';
import {
  withResolvers,
  toPaddedHex,
  isRPCError,
  fetchStorage,
} from '../utils.js';
import {
  type LineaProof,
  type RPCLineaGetProof,
  isInclusionProof,
  isContract,
  encodeProof,
  EMPTY_STORAGE_HASH,
} from './types.js';

const BLOCK_MISSING_IN_CHAIN = -32600;
const UNKNOWN_RPC_ERROR = -32603;

export class LineaProver extends BlockProver {
  static readonly EMPTY_STORAGE_HASH = EMPTY_STORAGE_HASH;
  static readonly isInclusionProof = isInclusionProof;
  static readonly isContract = isContract;
  static readonly encodeProof = encodeProof;
  static readonly latest = this._createLatest();
  stateRoot?: HexString32;
  override async fetchStateRoot() {
    if (!this.stateRoot) throw new Error(`unknown stateRoot`);
    return this.stateRoot;
  }
  async isShomeiReady() {
    // see: LineaRollup.fetchLatestCommitIndex()
    try {
      await this.getProofs(ZeroAddress);
      return true;
    } catch (cause) {
      if (isRPCError(cause, BLOCK_MISSING_IN_CHAIN, UNKNOWN_RPC_ERROR)) {
        return false;
      }
      throw new Error(`isShomeiReady()`, { cause });
    }
  }
  override async isContract(target: HexString): Promise<boolean> {
    if (this.fast) {
      return this.cache.get(target, async () => {
        const code = await this.provider.getCode(target, this.block);
        return code.length > 2;
      });
    }
    const { accountProof } = await this.getProofs(target);
    return isContract(accountProof);
  }
  override async getStorage(
    target: HexString,
    slot: bigint,
    fast: boolean = this.fast
  ): Promise<HexString> {
    target = target.toLowerCase();
    // check to see if we know this target isn't a contract
    const accountProof: LineaProof | undefined =
      await this.proofLRU.touch(target);
    if (accountProof && !isContract(accountProof, true)) {
      return ZeroHash;
    }
    // check to see if we've already have a proof for this value
    const storageKey = makeStorageKey(target, slot);
    const storageProof: LineaProof | undefined =
      await this.proofLRU.touch(storageKey);
    if (storageProof) {
      return isInclusionProof(storageProof)
        ? storageProof.proof.value
        : ZeroHash;
    }
    // we didn't have the proof
    if (fast) {
      return this.cache.get(storageKey, () => {
        return fetchStorage(this.provider, target, slot, this.block);
      });
    }
    const proof = await this.getProofs(target, [slot]);
    return isContract(proof.accountProof, true) &&
      isInclusionProof(proof.storageProofs[0])
      ? proof.storageProofs[0].proof.value
      : ZeroHash;
  }
  protected override async _proveNeed(
    need: TargetNeed,
    accountRef: ProofRef,
    slotRefs: Map<bigint, ProofRef>
  ) {
    const m = [...slotRefs];
    const accountProof: LineaProof | undefined = await this.proofLRU.peek(
      need.target
    );
    if (accountProof && !isContract(accountProof, true)) m.length = 0;
    const proofs = await this.getProofs(
      need.target,
      m.map(([slot]) => slot)
    );
    accountRef.proof = encodeProof(proofs.accountProof);
    if (isContract(proofs.accountProof, true)) {
      m.forEach(
        ([, ref], i) => (ref.proof = encodeProof(proofs.storageProofs[i]))
      );
    }
  }
  async getProofs(
    target: HexString,
    slots: bigint[] = []
  ): Promise<RPCLineaGetProof> {
    target = target.toLowerCase();
    // there are (3) cases:
    // 1.) account doesn't exist
    // 2.) account is EOA
    // 3.) account is contract
    const missing: number[] = [];
    const { promise, resolve, reject } = withResolvers();
    // check if we have an account proof
    let accountProof: Promise<LineaProof> | LineaProof | undefined =
      this.proofLRU.touch(target);
    if (!accountProof) {
      // missing account proof, so block it
      this.proofLRU.setFuture(
        target,
        promise.then(() => accountProof)
      );
    }
    // check if we're missing any slots
    const storageProofs: (Promise<LineaProof> | LineaProof | undefined)[] =
      slots.map((slot, i) => {
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
        const { storageProofs: v, accountProof: a } = await this.fetchProofs(
          target,
          missing.map((x) => slots[x])
        );
        // update the blocked values
        accountProof = a;
        missing.forEach((x, i) => (storageProofs[x] = v[i]));
        resolve();
      } catch (err) {
        reject(err);
        throw err; // must throw because accountProof is undefined
      }
    }
    // reassemble
    const [a, v] = await Promise.all([
      accountProof,
      Promise.all(storageProofs),
    ]);
    // 20250716: inconsistent rpc behavior
    // not-a-contract returns [null, ...]
    // contract-w/o-storage returns []
    this.checkStorageProofs(isContract(a, true), slots, v);
    return {
      accountProof: a,
      storageProofs: v as LineaProof[],
    };
  }
  async fetchProofs(target: HexString, slots: bigint[] = []) {
    const ps: Promise<RPCLineaGetProof>[] = [];
    for (let i = 0; ; ) {
      ps.push(
        // 20240825: most cloud providers seem to reject batched getProof
        // since we aren't in control of provider construction (ie. batchMaxSize)
        // sendImmediate is a temporary hack to avoid this issue
        // 20241027: use GatewayProvider
        this.provider.send('linea_getProof', [
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
    for (let i = 1; i < vs.length; i++) {
      vs[0].storageProofs.push(...vs[i].storageProofs);
    }
    return vs[0];
  }
}
