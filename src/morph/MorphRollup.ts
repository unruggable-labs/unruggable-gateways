import {
  type RollupCommit,
  type RollupDeployment,
  AbstractRollup,
} from '../rollup.js';
import type {
  HexAddress,
  HexString,
  ProviderPair,
  ProofSequence,
} from '../types.js';
import { Contract } from 'ethers/contract';
import { dataSlice } from 'ethers/utils';
import { CHAINS } from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER } from '../utils.js';
import { ROLLUP_ABI } from './types.js';

export type MorphConfig = {
  Rollup: HexAddress;
  poseidon: HexAddress;
};

export type MorphCommit = RollupCommit<EthProver> & {
  readonly l1BlockNumber: number;
};

// NOTE: this is very similar to Scroll...
// https://docs.morphl2.io/docs/about-morph/morphs-architecture
// https://docs.morphl2.io/docs/build-on-morph/build-on-morph/bridge-between-morph-and-ethereum
// https://docs.morphl2.io/docs/build-on-morph/developer-resources/morph-json-rpc-api-methods

export class MorphRollup extends AbstractRollup<MorphCommit> {
  // https://docs.morphl2.io/docs/build-on-morph/developer-resources/contracts
  static readonly mainnetConfig: RollupDeployment<MorphConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.MORPH,
    Rollup: '0x759894ced0e6af42c26668076ffa84d02e3cef60',
    poseidon: '0x3508174Fa966e75f70B15348209E33BC711AE63e',
  };
  static readonly holeskyConfig: RollupDeployment<MorphConfig> = {
    chain1: CHAINS.HOLESKY,
    chain2: CHAINS.MORPH_HOLESKY,
    Rollup: '0x759894ced0e6af42c26668076ffa84d02e3cef60',
    poseidon: '0x3508174Fa966e75f70B15348209E33BC711AE63e',
  };

  readonly Rollup: Contract;
  readonly poseidon: HexAddress;
  constructor(providers: ProviderPair, config: MorphConfig) {
    super(providers);
    this.Rollup = new Contract(config.Rollup, ROLLUP_ABI, this.provider1);
    this.poseidon = config.poseidon;
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return this.Rollup.lastFinalizedBatchIndex({
      blockTag: this.latestBlockTag,
    });
  }
  protected override async _fetchParentCommitIndex(
    commit: MorphCommit
  ): Promise<bigint> {
    return this.Rollup.lastFinalizedBatchIndex({
      blockTag: commit.l1BlockNumber - 1,
    });
  }
  protected override async _fetchCommit(index: bigint): Promise<MorphCommit> {
    const [[commitEvent], [finalEvent]] = await Promise.all([
      this.Rollup.queryFilter(this.Rollup.filters.CommitBatch(index)),
      this.Rollup.queryFilter(this.Rollup.filters.FinalizeBatch(index)),
    ]);
    if (!commitEvent) throw new Error(`unknown batch`);
    if (!finalEvent) throw new Error('not finalized');
    const tx = await commitEvent.getTransaction();
    const desc = this.Rollup.interface.parseTransaction(tx);
    if (!desc) throw new Error(`unknown transaction: ${tx.hash}`);
    const prover = new EthProver(
      this.provider2,
      parseLastBlock(desc.args.batchDataInput.blockContexts)
    );
    return { index, prover, l1BlockNumber: finalEvent.blockNumber };
  }
  override encodeWitness(
    commit: MorphCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256, bytes[], bytes)'],
      [[commit.index, proofSeq.proofs, proofSeq.order]]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // https://etherscan.io/advanced-filter?eladd=0x759894ced0e6af42c26668076ffa84d02e3cef60&eltpc=0x26ba82f907317eedc97d0cbef23de76a43dd6edb563bdb6e9407645b950a7a2d
    // https://explorer.morphl2.io/batches
    // block time: ~4sec
    // blocks per batch: ~285
    return Math.ceil(sec / 300); // units of batchIndex
  }
}

function parseLastBlock(context: HexString): bigint {
  // https://github.com/morph-l2/morph/blob/main/contracts/contracts/libraries/codec/BatchCodecV0.sol
  const SIZE = 60;
  const count = parseInt(context.slice(0, 6)); // uint16 => numBlocks
  const pos = 2 + SIZE * (count - 1);
  return BigInt(dataSlice(context, pos, pos + 8)); // uint64 => block[numBlocks - 1].blockNumber
}
