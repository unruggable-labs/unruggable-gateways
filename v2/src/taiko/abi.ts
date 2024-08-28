import { parseAbi } from 'viem';

// https://github.com/taikoxyz/taiko-mono/blob/main/packages/protocol/contracts/L1/TaikoL1.sol
export const taikoL1Abi = parseAbi([
  'struct TaikoConfig { uint64 chainId; uint64 blockMaxProposals; uint64 blockRingBufferSize; uint64 maxBlocksToVerify; uint32 blockMaxGasLimit; uint96 livenessBond; uint8 stateRootSyncInternal; bool checkEOAForCalldataDA; }',
  'function getLastSyncedBlock() view returns (uint64 blockId, bytes32 blockHash, bytes32 stateRoot)', //, uint64 verifiedAt
  'function getConfig() view returns (TaikoConfig)',
]);
