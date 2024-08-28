import { decodeFunctionData, encodeAbiParameters, toHex } from 'viem';
import { getContractEvents, getTransaction, readContract } from 'viem/actions';
import { mainnet, sepolia, zksync, zksyncSepoliaTestnet } from 'viem/chains';

import { CachedMap } from '../cached.js';
import {
  AbstractRollup,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type {
  ClientPair,
  EncodedProof,
  HexAddress,
  HexString,
  HexString32,
} from '../types.js';
import { ZKSyncProver } from './ZKSyncProver.js';
import { commitBatchesAbiSnippet, diamondProxyAbi } from './abi.js';
import { type ZKSyncClient } from './types.js';

// https://docs.zksync.io/zk-stack/concepts/finality
// https://github.com/matter-labs/era-contracts/tree/main/
// https://github.com/getclave/zksync-storage-proofs
// https://uptime.com/statuspage/era

export type ZKSyncCommit = RollupCommit<ZKSyncProver> & {
  readonly stateRoot: HexString32;
  readonly abiEncodedBatch: HexString;
};

export type ZKSyncConfig = {
  diamondProxyAddress: HexAddress;
};

export class ZKSyncRollup extends AbstractRollup<ZKSyncCommit, ZKSyncClient> {
  // https://docs.zksync.io/build/developer-reference/era-contracts/l1-contracts
  static readonly mainnetConfig: RollupDeployment<ZKSyncConfig> = {
    chain1: mainnet.id,
    chain2: zksync.id,
    diamondProxyAddress: '0x32400084c286cf3e17e7b677ea9583e60a000324',
  } as const;
  static readonly testnetConfig: RollupDeployment<ZKSyncConfig> = {
    chain1: sepolia.id,
    chain2: zksyncSepoliaTestnet.id,
    diamondProxyAddress: '0x9a6de0f62Aa270A8bCB1e2610078650D539B1Ef9',
  } as const;

  readonly diamondProxy: { address: HexAddress; abi: typeof diamondProxyAbi };

  constructor(clients: ClientPair<ZKSyncClient>, config: ZKSyncConfig) {
    super(clients);
    this.diamondProxy = {
      address: config.diamondProxyAddress,
      abi: diamondProxyAbi,
    };
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    const count = await readContract(this.client1, {
      ...this.diamondProxy,
      functionName: 'getTotalBatchesExecuted',
      blockTag: 'finalized',
    });
    return count - 1n;
  }
  override async fetchParentCommitIndex(commit: ZKSyncCommit): Promise<bigint> {
    return commit.index - 1n;
  }
  override async fetchCommit(index: bigint): Promise<ZKSyncCommit> {
    const batchIndex = Number(index);
    const details = await this.client2.request({
      method: 'zks_getL1BatchDetails',
      params: [batchIndex], // rpc requires number
    });
    // 20240810: this check fails even though the block is finalized
    // if (details.status !== 'verified') {
    //   throw new Error(`not verified: ${details.status}`);
    // }
    const { rootHash, commitTxHash } = details;
    if (!rootHash || !commitTxHash) {
      throw new Error(`Batch(${index}) not finalized`);
    }
    const [tx, [log], l2LogsTreeRoot] = await Promise.all([
      getTransaction(this.client1, { hash: commitTxHash }),
      getContractEvents(this.client1, {
        ...this.diamondProxy,
        eventName: 'BlockCommit',
        args: {
          batchNumber: index,
          batchHash: rootHash,
        },
      }),
      readContract(this.client1, {
        ...this.diamondProxy,
        functionName: 'l2LogsRootHash',
        args: [index],
      }),
    ]);
    if (!tx || !log) {
      throw new Error(`unable to find commit tx: ${commitTxHash}`);
    }
    const {
      args: [, , commits],
    } = decodeFunctionData({
      abi: commitBatchesAbiSnippet,
      data: tx.input,
    });
    const batchInfo = commits.find((x) => x.batchNumber == index);
    if (!batchInfo) {
      throw new Error(`expected batch in commit`);
    }
    const abiEncodedBatch = encodeAbiParameters(
      // StoredBatchInfo struct
      commitBatchesAbiSnippet[0].inputs[1].components,
      [
        batchInfo.batchNumber,
        batchInfo.newStateRoot,
        batchInfo.indexRepeatedStorageChanges,
        batchInfo.numberOfLayer1Txs,
        batchInfo.priorityOperationsHash,
        l2LogsTreeRoot,
        batchInfo.timestamp,
        log.args.commitment!,
      ]
    );
    return {
      index,
      prover: new ZKSyncProver(
        this.client2,
        batchIndex,
        new CachedMap(Infinity, this.commitCacheSize)
      ),
      stateRoot: rootHash,
      abiEncodedBatch,
    };
  }
  override encodeWitness(
    commit: ZKSyncCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }, { type: 'bytes' }],
      [commit.abiEncodedBatch, proofs, toHex(order)]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time not on-chain
    // approximately 1 batch every hour, sequential
    // https://explorer.zksync.io/batches/
    return Math.ceil(sec / 3600); // units of commit index
  }
}
