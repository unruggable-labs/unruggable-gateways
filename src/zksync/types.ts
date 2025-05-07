import type { HexAddress, HexString32 } from '../types.js';
import { Interface } from 'ethers/abi';
import { ABI_CODER } from '../utils.js';

export type ZKSyncStorageProof = {
  index: number;
  key: HexString32;
  proof: HexString32[];
  value: HexString32;
};

export type RPCZKSyncGetProof = {
  address: HexAddress;
  storageProof: ZKSyncStorageProof[];
};
// {
//   "address": "0x0000000000000000000000000000000000008003",
//   "storageProof": [
//     {
//       "key": "0x8b65c0cf1012ea9f393197eb24619fd814379b298b238285649e14f936a5eb12",
//       "proof": [
//         "0xe3e8e49a998b3abf8926f62a5a832d829aadc1b7e059f1ea59ffbab8e11edfb7",
//         ...
//       ],
//       "value": "0x0000000000000000000000000000000000000000000000000000000000000060",
//       "index": 27900957
//     }
//   ]
// }

type ISO8601DateTimeString = string;

// https://docs.zksync.io/build/api-reference/zks-rpc#zks_getl1batchdetails
export type RPCZKSyncL1BatchDetails = {
  baseSystemContractsHashes: {
    bootloader: HexString32;
    default_aa: HexString32;
  };
  commitTxHash: HexString32 | null;
  committedAt: ISO8601DateTimeString | null;
  executeTxHash: HexString32 | null;
  executedAt: ISO8601DateTimeString | null;
  proveTxHash: HexString32 | null;
  provenAt: ISO8601DateTimeString | null;
  fairPubdataPrice: number | null;
  l1GasPrice: number;
  l1TxCount: number;
  l2FairGasPrice: number;
  l2TxCount: number;
  number: number;
  rootHash: HexString32 | null; // is this really optional?
  status: string; // https://github.com/matter-labs/zksync-era/blob/main/core/lib/types/src/api/mod.rs#L751
  timestamp: number;
};
// {
//   baseSystemContractsHashes: {
//     bootloader: "0x010008e742608b21bf7eb23c1a9d0602047e3618b464c9b59c0fba3b3d7ab66e",
//     default_aa: "0x01000563374c277a2c1e34659a2a1e87371bb6d852ce142022d497bfb50b9e32",
//   },
//   commitTxHash: null,
//   committedAt: null,
//   executeTxHash: null,
//   executedAt: null,
//   fairPubdataPrice: 26312914845,
//   l1GasPrice: 16445571777,
//   l1TxCount: 0,
//   l2FairGasPrice: 45250000,
//   l2TxCount: 4697,
//   number: 490051,
//   proveTxHash: null,
//   provenAt: null,
//   rootHash: "0xe1b9854036656e4248ff7a4d02f8ed54af7622ec8ccf491ed4c038127d86220c",
//   status: "sealed",
//   timestamp: 1722535896,
// }
// {
//   baseSystemContractsHashes: {
//     bootloader: "0x010008e742608b21bf7eb23c1a9d0602047e3618b464c9b59c0fba3b3d7ab66e",
//     default_aa: "0x01000563374c277a2c1e34659a2a1e87371bb6d852ce142022d497bfb50b9e32",
//   },
//   commitTxHash: "0x6c64a5a74ec43e6f976a4115c11df2e5970eb94ef53e6343ccd4733398cc91f6",
//   committedAt: "2024-07-31T00:23:20.530744Z",
//   executeTxHash: "0xf52e75556d30278c03175df09b6a9c99e50816f475d8e7f9a052370af0eed4e8",
//   executedAt: "2024-07-31T23:26:20.895990Z",
//   fairPubdataPrice: 6309683979,
//   l1GasPrice: 3943552486,
//   l1TxCount: 1,
//   l2FairGasPrice: 45250000,
//   l2TxCount: 5089,
//   number: 489951,
//   proveTxHash: "0xf1006641e4ac3a781c85a917030ce3f2b5a2d84a6a418d4a6aa807a404a68e64",
//   provenAt: "2024-07-31T02:50:28.619027Z",
//   rootHash: "0x171bf844dfdb737175ef6f616677c02169482e6f32203ca3d7cde56fcf7014dd",
//   status: "verified",
//   timestamp: 1722381027,
// }

// export type ABIZKSyncCommitBatchInfo = {
//   batchNumber: bigint;
//   timestamp: bigint;
//   indexRepeatedStorageChanges: bigint;
//   newStateRoot: HexString32;
//   numberOfLayer1Txs: bigint;
//   priorityOperationsHash: HexString32;
//   bootloaderHeapInitialContentsHash: HexString32;
//   eventsQueueStateHash: HexString32;
//   systemLogs: HexString;
//   pubdataCommitments: HexString;
// };

// https://github.com/matter-labs/era-contracts/blob/main/l1-contracts/contracts/state-transition/chain-interfaces/IGetters.sol
// https://github.com/matter-labs/era-contracts/blob/main/l1-contracts/contracts/state-transition/chain-interfaces/IExecutor.sol
export const DIAMOND_ABI = new Interface([
  `function storedBatchHash(uint256 batchNumber) view returns (bytes32)`,
  `function l2LogsRootHash(uint256 batchNumber) external view returns (bytes32)`,
  //`function getTotalBatchesCommitted() view returns (uint256)`,
  //`function getTotalBatchesVerified() view returns (uint256)`,
  `function getTotalBatchesExecuted() view returns (uint256)`,
  `function commitBatchesSharedBridge(
    uint256 chainId,
    uint256 batchIndex0,
    uint256 batchIndex1,
    bytes commitData
  )`,
  // `function commitBatchesSharedBridge(
  //   uint256 chainId,
  //   (
  //     uint64 batchNumber,
  //     bytes32 batchHash,
  //     uint64 indexRepeatedStorageChanges,
  //     uint256 numberOfLayer1Txs,
  //     bytes32 priorityOperationsHash,
  //     bytes32 l2LogsTreeRoot,
  //     uint256 timestamp,
  //     bytes32 commitment,
  //   ) lastCommittedBatchData,
  //   (
  //     uint64 batchNumber,
  //     uint64 timestamp,
  //     uint64 indexRepeatedStorageChanges,
  //     bytes32 newStateRoot,
  //     uint256 numberOfLayer1Txs,
  //     bytes32 priorityOperationsHash,
  //     bytes32 bootloaderHeapInitialContentsHash,
  //     bytes32 eventsQueueStateHash,
  //     bytes systemLogs,
  //     bytes pubdataCommitments
  //   )[] newBatchesData
  // )`,
  `event BlockCommit(
    uint256 indexed batchNumber,
    bytes32 indexed batchHash,
    bytes32 indexed commitment
  )`,
]);

export function encodeProof(proof: ZKSyncStorageProof) {
  return ABI_CODER.encode(
    ['bytes32', 'uint64', 'bytes32[]'],
    [proof.value, proof.index, proof.proof]
  );
}
