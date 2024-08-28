import { parseAbi } from 'viem';

export const rollupAbi = parseAbi([
  'function currentL2BlockNumber() view returns (uint256)',
  'function stateRootHashes(uint256 l2BlockNumber) view returns (bytes32)',
  'event DataFinalized(uint256 indexed lastBlockFinalized, bytes32 indexed startingRootHash, bytes32 indexed finalRootHash, bool withProof)',
  'event BlocksVerificationDone(uint256 indexed lastBlockFinalized, bytes32 startingRootHash, bytes32 finalRootHash)',
]);
