import type {
  HexAddress,
  HexString,
  HexString32,
  ProviderPair,
  ProofSequence,
} from '../types.js';
import { ZKSyncProver } from './ZKSyncProver.js';
import { DIAMOND_ABI } from './types.js';
import { ZeroHash } from 'ethers/constants';
import { Contract, EventLog } from 'ethers/contract';
import { CHAINS } from '../chains.js';
import {
  type RollupDeployment,
  type RollupCommit,
  AbstractRollup,
} from '../rollup.js';
import { ABI_CODER } from '../utils.js';
import { dataSlice } from 'ethers/utils';

// https://docs.zksync.io/zk-stack/concepts/finality
// https://docs.zksync.io/build/developer-reference/batches-and-l2-blocks
// https://github.com/matter-labs/era-contracts/tree/main/
// https://github.com/getclave/zksync-storage-proofs
// https://uptime.com/statuspage/era

export type ZKSyncConfig = {
  DiamondProxy: HexAddress;
};

export type ZKSyncCommit = RollupCommit<ZKSyncProver> & {
  readonly stateRoot: HexString32;
  readonly abiEncodedBatch: HexString;
};

export class ZKSyncRollup extends AbstractRollup<ZKSyncCommit> {
  // https://docs.zksync.io/build/developer-reference/era-contracts/l1-contracts
  static readonly mainnetConfig: RollupDeployment<ZKSyncConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ZKSYNC,
    DiamondProxy: '0x32400084c286cf3e17e7b677ea9583e60a000324',
  };
  static readonly sepoliaConfig: RollupDeployment<ZKSyncConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.ZKSYNC_SEPOLIA,
    DiamondProxy: '0x9A6DE0f62Aa270A8bCB1e2610078650D539B1Ef9',
  };

  // https://docs.zero.network/main-features/system-contracts#zer%CE%B8-network
  static readonly zeroMainnetConfig: RollupDeployment<ZKSyncConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ZERO,
    DiamondProxy: '0xdbD849acC6bA61F461CB8A41BBaeE2D673CA02d9',
  };
  static readonly zeroSepoliaConfig: RollupDeployment<ZKSyncConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.ZERO_SEPOLIA,
    DiamondProxy: '0x9A62B01fFa3bD358d03508ef60bB522ABA5d1bEb',
  };

  // https://docs.abs.xyz/how-abstract-works/architecture/components/l1-rollup-contracts#list-of-l1-rollup-contracts
  static readonly abstractSepoliaConfig: RollupDeployment<ZKSyncConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.ABSTRACT_SEPOLIA,
    DiamondProxy: '0x8aD52ff836A30f063dF51A00C99518880B8b36ac',
  };

  readonly DiamondProxy: Contract;
  constructor(providers: ProviderPair, config: ZKSyncConfig) {
    super(providers);
    this.DiamondProxy = new Contract(
      config.DiamondProxy,
      DIAMOND_ABI,
      this.provider1
    );
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    const count: bigint = await this.DiamondProxy.getTotalBatchesExecuted({
      blockTag: this.latestBlockTag,
    });
    return count - 1n;
  }
  protected override async _fetchCommit(index: bigint): Promise<ZKSyncCommit> {
    const prover = new ZKSyncProver(this.provider2, Number(index));
    const details = await prover.fetchBatchDetails();
    if (!details.commitTxHash) throw new Error('no commitTxHash');
    // 20240810: this check randomly fails even though the block is finalized
    // if (details.status !== 'verified') {
    //   throw new Error(`not verified: ${details.status}`);
    // }
    const [tx, [log], l2LogsTreeRoot] = await Promise.all([
      this.provider1.getTransaction(details.commitTxHash),
      this.DiamondProxy.queryFilter(
        this.DiamondProxy.filters.BlockCommit(index, details.rootHash)
      ),
      this.DiamondProxy.l2LogsRootHash(index) as Promise<HexString32>,
    ]);
    if (!tx) throw new Error(`missing commit tx: ${details.commitTxHash}`);
    if (!(log instanceof EventLog)) throw new Error(`no BlockCommit event`);
    if (l2LogsTreeRoot === ZeroHash) throw new Error('not finalized');
    // 20240909: interface was changed
    // https://github.com/matter-labs/era-contracts/commit/49868afc8590c3d09daf4d5fc73dcc31587f487d
    const batch = decodeBatches(tx.data).find((x) => x.batchNumber === index);
    if (!batch) throw new Error(`batch not in commit`);
    const abiEncodedBatch = ABI_CODER.encode(
      [
        'uint64', // batchNumber
        'bytes32', // batchHash
        'uint64', // indexRepeatedStorageChanges
        'uint256', // numberOfLayer1Txs
        'bytes32', // priorityOperationsHash
        'bytes32', // l2LogsTreeRoot
        'uint256', // timestamp
        'bytes32', // commitment
      ],
      [
        batch.batchNumber, // == index
        batch.newStateRoot, // == details.rootHash
        batch.indexRepeatedStorageChanges,
        batch.numberOfLayer1Txs,
        batch.priorityOperationsHash,
        l2LogsTreeRoot,
        batch.timestamp,
        log.args.commitment,
      ]
    );
    return {
      index,
      prover,
      stateRoot: details.rootHash,
      abiEncodedBatch,
    };
  }
  override encodeWitness(
    commit: ZKSyncCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(bytes, bytes[], bytes)'],
      [[commit.abiEncodedBatch, proofSeq.proofs, proofSeq.order]]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time not on-chain
    // approximately 1 batch every hour, sequential
    // https://explorer.zksync.io/batches/
    return Math.ceil(sec / 3600); // units of commit index
  }
}

type BatchInfo = {
  batchNumber: bigint;
  timestamp: number;
  indexRepeatedStorageChanges: bigint;
  newStateRoot: HexString32;
  numberOfLayer1Txs: bigint;
  priorityOperationsHash: HexString32;
  // bootloaderHeapInitialContentsHash: HexString32;
  // eventsQueueStateHash: HexString32;
  // systemLogs: HexString;
  // operatorDAInput: HexString;
};

// https://github.com/matter-labs/era-contracts/blob/14961f1efecac1030139c4cf0655b14135197772/l1-contracts/test/unit_tests/utils.ts#L543-L553
// https://github.com/matter-labs/era-contracts/blob/14961f1efecac1030139c4cf0655b14135197772/l1-contracts/src.ts/utils.ts#L38-L41
function decodeBatches(txData: HexString): BatchInfo[] {
  const { commitData } = DIAMOND_ABI.decodeFunctionData(
    'commitBatchesSharedBridge',
    txData
  );
  const version = parseInt(dataSlice(commitData, 0, 1));
  if (version === 0) {
    const [/*stored*/ _, batches] = ABI_CODER.decode(
      [
        `(
          uint64 batchNumber,
          bytes32 batchHash,
          uint64 indexRepeatedStorageChanges,
          uint256 numberOfLayer1Txs,
          bytes32 priorityOperationsHash,
          bytes32 l2LogsTreeRoot,
          uint256 timestamp,
          bytes32 commitment
        )`,
        `(
          uint64 batchNumber,
          uint64 timestamp,
          uint64 indexRepeatedStorageChanges,
          bytes32 newStateRoot,
          uint256 numberOfLayer1Txs,
          bytes32 priorityOperationsHash,
          bytes32 bootloaderHeapInitialContentsHash,
          bytes32 eventsQueueStateHash,
          bytes systemLogs,
          bytes operatorDAInput
        )[]`,
      ],
      dataSlice(commitData, 1)
    );
    return batches;
  } else {
    throw new Error(`unexpected commit version: ${version}`);
  }
}
