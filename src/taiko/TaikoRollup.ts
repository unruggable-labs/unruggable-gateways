import {
  AbstractRollup,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type {
  HexAddress,
  HexString,
  ProviderPair,
  ProofSequence,
} from '../types.js';
import { Contract } from 'ethers/contract';
import { CHAINS } from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER } from '../utils.js';
import { Interface } from 'ethers/abi';
import { CachedValue } from '../cached.js';

// https://github.com/taikoxyz/taiko-mono/
// https://docs.taiko.xyz/network-reference/differences-from-ethereum
// https://status.taiko.xyz/

// https://x.com/taikoxyz/status/1923698062503051483
// https://taiko.mirror.xyz/pIchmo0E-DfSySCzL52BFbus54Z3XJEO0k0Ptqqpm_I

// https://docs.taiko.xyz/taiko-alethia-protocol/codebase-analysis/taikol1-contract
const ROLLUP_ABI = new Interface([
  `function getConfig() view returns ((
     uint64 chainId,
     uint64 blockMaxProposals,
     uint64 blockRingBufferSize,
     uint64 maxBlocksToVerify,
     uint32 blockMaxGasLimit,
     uint96 livenessBond,
     uint8 stateRootSyncInternal,
     bool checkEOAForCalldataDA
  ))`,
  `function getLastSyncedTransition() view returns (uint64 batchId)`,
  `function getBatch(uint64 batchId) view returns ((
     bytes32 metaHash,
     uint64 lastBlockId,
     uint96 reserved3,
     uint96 livenessBond,
     uint64 batchId,
     uint64 lastBlockTimestamp,
     uint64 anchorBlockId,
     uint24 nextTransitionId,
     uint8 reserved4,
     uint24 verifiedTransitionId
  ))`,
]);

type ABIBatch = {
  verifiedTransitionId: number;
  lastBlockId: bigint;
};

export type TaikoConfig = {
  TaikoL1: HexAddress;
};

export type TaikoCommit = RollupCommit<EthProver> & {
  readonly tid: number;
};

export class TaikoRollup extends AbstractRollup<TaikoCommit> {
  // https://docs.taiko.xyz/network-reference/mainnet-addresses
  static readonly mainnetConfig: RollupDeployment<TaikoConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.TAIKO,
    TaikoL1: '0x06a9Ab27c7e2255df1815E6CC0168d7755Feb19a',
  };

  static readonly heklaConfig: RollupDeployment<TaikoConfig> = {
    chain1: CHAINS.HOLESKY,
    chain2: CHAINS.TAIKO_HEKLA,
    TaikoL1: '0x79C9109b764609df928d16fC4a91e9081F7e87DB',
  };

  readonly TaikoL1: Contract;
  readonly commitStep = new CachedValue(async () => {
    const cfg = await this.TaikoL1.getConfig();
    return cfg.stateRootSyncInternal * BigInt(this.commitSpan);
  }, Infinity);
  constructor(
    providers: ProviderPair,
    config: TaikoConfig,
    readonly commitSpan = 1
  ) {
    super(providers);
    this.TaikoL1 = new Contract(config.TaikoL1, ROLLUP_ABI, this.provider1);
  }

  override fetchLatestCommitIndex(): Promise<bigint> {
    return this.TaikoL1.getLastSyncedTransition({
      blockTag: this.latestBlockTag,
    });
  }
  protected override async _fetchParentCommitIndex(
    commit: TaikoCommit
  ): Promise<bigint> {
    return commit.index - (await this.commitStep.get());
  }
  protected override async _fetchCommit(index: bigint): Promise<TaikoCommit> {
    const batch: ABIBatch = await this.TaikoL1.getBatch(index);
    if (!batch.verifiedTransitionId) throw new Error('unverified');
    const prover = new EthProver(this.provider2, batch.lastBlockId);
    return { index, prover, tid: batch.verifiedTransitionId };
  }
  override encodeWitness(
    commit: TaikoCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256, uint24, bytes[], bytes)'],
      [[commit.index, commit.tid, proofSeq.proofs, proofSeq.order]]
    );
  }
  override windowFromSec(sec: number): number {
    // taiko is a based rollup
    // createdAt is available onchain
    return sec;
  }
}
