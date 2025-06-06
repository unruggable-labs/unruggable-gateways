import type { HexString, ProofSequence, Provider } from '../types.js';
import { AbstractRollup, align, type RollupCommit } from '../rollup.js';
import { fetchBlockNumber, ABI_CODER, MAINNET_BLOCK_SEC } from '../utils.js';
import { EthProver } from './EthProver.js';
import { encodeRlpBlock } from '../rlp.js';
import { VOID_PROVIDER } from '../VoidProvider.js';

export type EthSelfCommit = RollupCommit<EthProver> & {
  readonly rlpEncodedBlock: HexString;
};

// since a provable block occurs every 12 seconds, caching isn't very effective
// to increase the likelihood of caching, increase the step
// (15 min) * (60 sec/min) / (12 sec/block) = 75 blocks
// note: blockhash() only has 256 depth

export class EthSelfRollup extends AbstractRollup<EthSelfCommit> {
  constructor(
    provider: Provider,
    readonly commitStep = 1
  ) {
    super({ provider1: provider, provider2: VOID_PROVIDER });
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    return align(
      await fetchBlockNumber(this.provider1, this.latestBlockTag),
      this.commitStep
    );
  }
  protected override async _fetchParentCommitIndex(
    commit: EthSelfCommit
  ): Promise<bigint> {
    return align(commit.index - 1n, this.commitStep);
  }
  protected override async _fetchCommit(index: bigint): Promise<EthSelfCommit> {
    const prover = new EthProver(this.provider1, index);
    const blockInfo = await prover.fetchBlock();
    const rlpEncodedBlock = encodeRlpBlock(blockInfo);
    return { index, prover, rlpEncodedBlock };
  }
  override encodeWitness(
    commit: EthSelfCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(bytes, bytes[], bytes)'],
      [[commit.rlpEncodedBlock, proofSeq.proofs, proofSeq.order]]
    );
  }
  override windowFromSec(sec: number): number {
    return Math.ceil(sec / MAINNET_BLOCK_SEC); // units of blocks
  }
}
