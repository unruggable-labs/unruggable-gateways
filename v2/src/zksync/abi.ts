import { parseAbi } from 'viem';

// https://github.com/matter-labs/era-contracts/blob/main/l1-contracts/contracts/state-transition/chain-interfaces/IGetters.sol
// https://github.com/matter-labs/era-contracts/blob/main/l1-contracts/contracts/state-transition/chain-interfaces/IExecutor.sol
export const commitBatchesAbiSnippet = parseAbi([
  'struct StoredBatchInfo { uint64 batchNumber; bytes32 batchHash; uint64 indexRepeatedStorageChange; uint256 numberOfLayer1Txs; bytes32 priorityOperationsHash; bytes32 l2LogsTreeRoot; uint256 timestamp; bytes32 commitment; }',
  'struct CommitBatchInfo { uint64 batchNumber; uint64 timestamp; uint64 indexRepeatedStorageChanges; bytes32 newStateRoot; uint256 numberOfLayer1Txs; bytes32 priorityOperationsHash; bytes32 bootloaderHeapInitialContentsHash; bytes32 eventsQueueStateHash; bytes systemLogs; bytes pubdataCommitments; }',
  'function commitBatchesSharedBridge(uint256 chainId, StoredBatchInfo lastCommittedBatchData, CommitBatchInfo[] newBatchesData)',
]);
const otherAbi = parseAbi([
  'function storedBatchHash(uint256 batchNumber) view returns (bytes32)',
  'function l2LogsRootHash(uint256 batchNumber) external view returns (bytes32)',
  //'function getTotalBatchesCommitted() view returns (uint256)',
  //'function getTotalBatchesVerified() view returns (uint256)',
  'function getTotalBatchesExecuted() view returns (uint256)',
  'event BlockCommit(uint256 indexed batchNumber, bytes32 indexed batchHash, bytes32 indexed commitment)',
]);
export const diamondProxyAbi = [
  ...commitBatchesAbiSnippet,
  ...otherAbi,
] as const;
