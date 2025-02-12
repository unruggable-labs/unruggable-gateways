import {
  AbstractRollup,
  RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type {
  HexAddress,
  HexString,
  HexString32,
  ProviderPair,
  ProofSequence,
} from '../types.js';
import { CHAINS } from '../chains.js';
import { ROLLUP_ABI } from './types.js';
import { Contract } from 'ethers/contract';
import { ZKEVMProver } from './ZKEVMProver.js';
import { ZeroHash } from 'ethers/constants';
import { ABI_CODER, toUnpaddedHex } from '../utils.js';

export type ZKEVMConfig = {
  RollupManager: HexAddress;
};

export type ZKEVMCommit = RollupCommit<ZKEVMProver>; // & {};

// https://hackmd.io/@4cbvqzFdRBSWMHNeI8Wbwg/Syz8PeEo0
// https://github.com/0xPolygonHermez/cdk-erigon/commit/33acc63073f16a13398ef868bb4dbdd49da720ae
// https://github.com/0xPolygonHermez/cdk-erigon/commit/33acc63073f16a13398ef868bb4dbdd49da720ae#diff-715521c7a2c24ae8e05a5c9eb0c80c348cd4ac0a1151467a4eb41d5f1a570684R1717

export class ZKEVMRollup extends AbstractRollup<ZKEVMCommit> {
  // https://docs.polygon.technology/zkEVM/architecture/high-level/smart-contracts/addresses/#mainnet-contracts
  static readonly mainnetConfig: RollupDeployment<ZKEVMConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ZKEVM,
    RollupManager: '0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2',
  };
  // https://github.com/0xPolygonHermez/cdk-erigon/tree/zkevm#networks
  static readonly sepoliaConfig: RollupDeployment<ZKEVMConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.ZKEVM_CARDONA,
    RollupManager: '0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff',
  };

  static async create(providers: ProviderPair, config: ZKEVMConfig) {
    const RollupManager = new Contract(
      config.RollupManager,
      ROLLUP_ABI,
      providers.provider1
    );
    const network = await providers.provider2.getNetwork();
    const rollupID = await RollupManager.chainIDToRollupID(network.chainId);
    return new this(providers, RollupManager, rollupID);
  }

  // TODO: refactor to make this public
  private constructor(
    providers: ProviderPair,
    readonly RollupManager: Contract,
    readonly rollupID: number
  ) {
    super(providers);
  }

  override fetchLatestCommitIndex(): Promise<bigint> {
    return this.RollupManager.getLastVerifiedBatch(this.rollupID, {
      blockTag: this.latestBlockTag,
    });
  }
  private fetchBatchStateRoot(batchIndex: bigint): Promise<HexString32> {
    return this.RollupManager.getRollupBatchNumToStateRoot(
      this.rollupID,
      batchIndex
    );
  }
  private fetchBatchInfo(batchIndex: bigint): Promise<{ number: HexString }> {
    return this.provider2.send('zkevm_getBatchByNumber', [
      toUnpaddedHex(batchIndex),
    ]);
  }
  protected override async _fetchCommit(index: bigint): Promise<ZKEVMCommit> {
    const [batchInfo, stateRoot] = await Promise.all([
      this.fetchBatchInfo(index),
      this.fetchBatchStateRoot(index),
    ]);
    if (stateRoot == ZeroHash) throw new Error('not finalized');
    const prover = new ZKEVMProver(this.provider2, batchInfo.number);
    return { index, prover };
  }
  override encodeWitness(
    commit: ZKEVMCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['tuple(uint256, bytes[], bytes)'],
      [[commit.index, proofSeq.proofs, proofSeq.order]]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization is kinda on-chain
    // sequencing time is available
    return sec;
  }
}
