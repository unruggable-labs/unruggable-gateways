import { parseAbi } from 'viem';

export const rollupAbi = parseAbi([
  'struct Node { bytes32 stateHash; bytes32 challengeHash; bytes32 confirmData; uint64 prevNum; uint64 deadlineBlock; uint64 noChildConfirmedBeforeBlock; uint64 stakerCount; uint64 childStakerCount; uint64 firstChildBlock; uint64 latestChildNumber; uint64 createdAtBlock; bytes32 nodeHash; }',
  'struct GlobalState { bytes32[2] bytes32Vals; uint64[2] u64Vals; }',
  'struct ExecutionState { GlobalState globalState; uint8 machineStatus; }',
  'struct Assertion { ExecutionState beforeState; ExecutionState afterState; uint64 numBlocks; }',
  'function latestConfirmed() view returns (uint64)',
  'function getNode(uint64 nodeNum) view returns (Node)',
  'event NodeCreated(uint64 indexed nodeNum, bytes32 indexed parentNodeHash, bytes32 indexed nodeHash, bytes32 executionHash, Assertion assertion, bytes32 afterInboxBatchAcc, bytes32 wasmModuleRoot, uint256 inboxMaxCount)',
]);
