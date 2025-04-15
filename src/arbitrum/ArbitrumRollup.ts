import { EthProver } from '../eth/EthProver.js';
import { type RollupCommit, AbstractRollup } from '../rollup.js';
import type {
  HexAddress,
  HexString,
  ProofSequence,
  ProviderPair,
} from '../types.js';
import { ABI_CODER, MAINNET_BLOCK_SEC } from '../utils.js';
import { Interface } from 'ethers/abi';
import { Contract } from 'ethers/contract';

export type ArbitrumConfig = {
  Rollup: HexAddress;
  isBoLD: boolean;
};

export type ArbitrumCommit = RollupCommit<EthProver> & {
  readonly encodedRollupProof: HexString;
};

export abstract class AbstractArbitrumRollup<
  C extends ArbitrumCommit,
> extends AbstractRollup<C> {
  readonly Rollup: Contract;
  protected constructor(
    providers: ProviderPair,
    readonly isBoLD: boolean,
    config: ArbitrumConfig,
    abi: Interface,
    public minAgeBlocks: number
  ) {
    if (config.isBoLD != isBoLD) throw new TypeError('isBold mismatch');
    super(providers);
    this.Rollup = new Contract(config.Rollup, abi, this.provider1);
  }

  override get unfinalized() {
    return !!this.minAgeBlocks;
  }

  override encodeWitness(
    commit: ArbitrumCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(bytes, bytes[], bytes)'],
      [[commit.encodedRollupProof, proofSeq.proofs, proofSeq.order]]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // the delta between createdAtBlock is a sufficient proxy
    return Math.ceil(sec / MAINNET_BLOCK_SEC); // units of L1 blocks
  }
}
