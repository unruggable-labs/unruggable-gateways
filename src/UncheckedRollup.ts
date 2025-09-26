import type {
  HexAddress,
  HexString,
  ProofRef,
  ProofSequence,
  Provider,
} from './types.js';
import { BlockProver, makeStorageKey, type TargetNeed } from './vm.js';
import { AbstractRollup, align, type RollupCommit } from './rollup.js';
import {
  ABI_CODER,
  fetchBlock,
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

export type UncheckedCommit = RollupCommit<UncheckedProver> & {
  readonly t: bigint;
};

export class UncheckedRollup extends AbstractRollup<UncheckedCommit> {
  constructor(
    provider2: Provider,
    readonly commitStep = 1
  ) {
    super({ provider1: VOID_PROVIDER, provider2 });
    this.latestBlockTag = LATEST_BLOCK_TAG;
  }
  override get unfinalized() {
    return true;
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    const block = await fetchBlock(this.provider2, this.latestBlockTag);
    return BigInt(block.timestamp);
  }
  protected override async _fetchParentCommitIndex(
    commit: UncheckedCommit
  ): Promise<bigint> {
    const { blockNumber } = commit.prover;
    if (!blockNumber) return -1n;
    const block = await fetchBlock(
      this.provider2,
      align(blockNumber - 1n, this.commitStep)
    );
    return BigInt(block.timestamp);
  }
  async findVisibleBlock(t: bigint) {
    // assumes block times are unique
    let b = await fetchBlock(this.provider2, this.latestBlockTag);
    if (t >= BigInt(b.timestamp)) return b; // fast path
    let a;
    for (let depth = 16n; ; ) {
      let i = BigInt(b.number);
      i = i > depth ? i - depth : 0n;
      a = await fetchBlock(this.provider2, i);
      if (t >= BigInt(a.timestamp)) break;
      if (!i) throw new Error(`no earlier block: ${t}`);
      depth <<= 1n;
      b = a;
    }
    for (;;) {
      const ia = BigInt(a.number);
      const ib = BigInt(b.number);
      if (ia === ib) break;
      const ic = (ia + ib) >> 1n;
      if (ic == ia) return t > BigInt(a.timestamp) ? b : a;
      const c = await fetchBlock(this.provider2, ic);
      if (t > BigInt(c.timestamp)) {
        a = c;
      } else {
        b = c;
      }
    }
    return b;
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<UncheckedCommit> {
    const block = await this.findVisibleBlock(index);
    const prover = new UncheckedProver(this.provider2, block.number);
    return { index, prover, t: BigInt(block.timestamp) };
  }
  override encodeWitness(
    commit: UncheckedCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', 'bytes[]', 'bytes'],
      [commit.t, proofSeq.proofs, proofSeq.order]
    );
  }
  override windowFromSec(sec: number): number {
    return sec;
  }
}
