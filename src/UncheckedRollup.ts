import type {
  HexAddress,
  HexString,
  ProofRef,
  ProofSequence,
  Provider,
} from './types.js';
import { BlockProver, makeStorageKey, type TargetNeed } from './vm.js';
import { AbstractRollup, type RollupCommit } from './rollup.js';
import {
  ABI_CODER,
  fetchBlockNumber,
  fetchStorage,
  LATEST_BLOCK_TAG,
} from './utils.js';
import { VOID_PROVIDER } from './VoidProvider.js';

export class UncheckedProver extends BlockProver {
  static readonly latest = this._createLatest();
  override isContract(target: HexAddress): Promise<boolean> {
    target = target.toLowerCase();
    return this.cache.get(target, async (a) => {
      const code = await this.provider.getCode(a, this.block);
      return code.length > 2;
    });
  }
  override getStorage(target: HexAddress, slot: bigint): Promise<HexString> {
    target = target.toLowerCase();
    return this.cache.get(makeStorageKey(target, slot), () => {
      return fetchStorage(this.provider, target, slot, this.block);
    });
  }
  protected override async _proveNeed(
    need: TargetNeed,
    accountRef: ProofRef,
    slotRefs: Map<bigint, ProofRef>
  ): Promise<void> {
    if (await this.isContract(need.target)) {
      accountRef.proof = '0x01';
      const m = [...slotRefs];
      const values = await Promise.all(
        m.map(([slot]) => this.getStorage(need.target, slot))
      );
      m.forEach(([, ref], i) => (ref.proof = values[i]));
    }
  }
}

export type UncheckedCommit = RollupCommit<UncheckedProver>;

export class UncheckedRollup extends AbstractRollup<UncheckedCommit> {
  constructor(provider2: Provider) {
    super({ provider1: VOID_PROVIDER, provider2 });
    this.latestBlockTag = LATEST_BLOCK_TAG;
  }
  override get unfinalized() {
    return true;
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    return fetchBlockNumber(this.provider2, this.latestBlockTag);
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<UncheckedCommit> {
    const prover = new UncheckedProver(this.provider2, index);
    return { index, prover };
  }
  override encodeWitness(
    _commit: UncheckedCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['bytes[]', 'bytes'],
      [proofSeq.proofs, proofSeq.order]
    );
  }
  override windowFromSec(sec: number): number {
    return sec;
  }
}
