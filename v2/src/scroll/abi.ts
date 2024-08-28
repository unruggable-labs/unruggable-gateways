// https://github.com/scroll-tech/scroll/tree/738c85759d0248c005469972a49fc983b031ff1c/contracts/src/L1

import { parseAbi } from 'viem';

export const verifierAbi = parseAbi([
  'function rollup() view returns (address)',
  'function poseidon() view returns (address)',
]);

export const rollupAbi = parseAbi([
  'function lastFinalizedBatchIndex() view returns (uint256)',
  //'function finalizedStateRoots(uint256 batchIndex) view returns (bytes32)',
]);

export const poseidonAbi = parseAbi([
  'function poseidon(uint256[2], uint256) external view returns (bytes32)',
]);
