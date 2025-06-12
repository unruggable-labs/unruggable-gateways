import type {
  HexAddress,
  HexString,
  ProofSequence,
  ProviderPair,
} from './types.js';
import type { AbstractProver, LatestProverFactory } from './vm.js';
import { AbstractRollup, type RollupCommit } from './rollup.js';
import { ABI_CODER, LATEST_BLOCK_TAG } from './utils.js';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';

const ABI = new Interface([
  `function latestIndex() view returns (uint256)`,
  `function commits(uint256 index) view returns ((bytes32 stateRoot, uint256 prevIndex))`,
  // setter
  `function setStateRoot(uint256 index, bytes32 stateRoot)`,
]);

export class InteractiveRollup<P extends AbstractProver> extends AbstractRollup<
  RollupCommit<P>
> {
  static readonly ABI = ABI;
  readonly Rollup: Contract;
  constructor(
    providers: ProviderPair,
    rollup: HexAddress,
    readonly factory: LatestProverFactory<P>
  ) {
    super(providers);
    this.latestBlockTag = LATEST_BLOCK_TAG;
    this.Rollup = new Contract(rollup, ABI, this.provider1);
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    return this.Rollup.latestIndex({ blockTag: this.latestBlockTag });
  }
  protected override async _fetchParentCommitIndex(
    commit: RollupCommit<P>
  ): Promise<bigint> {
    const { prevIndex } = await this.Rollup.commits(commit.index);
    return prevIndex;
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<RollupCommit<P>> {
    const prover = await this.factory.latest(this.provider2, index);
    return { index, prover };
  }
  override encodeWitness(
    commit: RollupCommit<P>,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', 'bytes[]', 'bytes'],
      [commit.index, proofSeq.proofs, proofSeq.order]
    );
  }
  override windowFromSec(_sec: number): number {
    throw new Error('not implemented');
  }
}
