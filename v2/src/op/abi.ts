import { parseAbi } from 'viem';

export const oracleAbi = parseAbi([
  'function latestOutputIndex() external view returns (uint256)',
  'function getL2Output(uint256 outputIndex) external view returns ((bytes32 outputRoot, uint128 timestamp, uint128 l2BlockNumber))',
]);

export const portalAbi = parseAbi([
  'function disputeGameFactory() view returns (address)',
  'function respectedGameType() view returns (uint32)',
]);

export const gameFinderAbi = parseAbi([
  'function findFinalizedGameIndex(address portal, uint256 gameTypes, uint256 gameCount) external view returns (uint256)',
  'function getFinalizedGame(address portal, uint256 gameTypes, uint256 gameIndex) external view returns (uint256 gameType, address gameProxy, uint256 l2BlockNumber)',
]);
