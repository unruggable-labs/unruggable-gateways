// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { OPFaultParams } from './OPStructs.sol';

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/src/L1/OptimismPortal2.sol
interface IOptimismPortal {
    function disputeGameFactory() external view returns (IDisputeGameFactory);
    function respectedGameType() external view returns (uint256);
    function disputeGameBlacklist(
        IDisputeGame game
    ) external view returns (bool);
    function disputeGameFinalityDelaySeconds() external view returns (uint256);
    function respectedGameTypeUpdatedAt() external view returns (uint64);
}

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/interfaces/dispute/IDisputeGameFactory.sol
interface IDisputeGameFactory {
    function gameCount() external view returns (uint256);
    function gameAtIndex(
        uint256 index
    )
        external
        view
        returns (uint256 gameType, uint256 created, IDisputeGame gameProxy);
}

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/interfaces/dispute/IDisputeGame.sol
interface IDisputeGame {
    function status() external view returns (uint256);
    function l2BlockNumber() external view returns (uint256);
    function rootClaim() external view returns (bytes32);
    function resolvedAt() external view returns (uint64);
    function wasRespectedGameTypeWhenCreated() external view returns (bool);
    function gameCreator() external view returns (address);
    function createdAt() external view returns (uint64);
}

interface IOPFaultGameFinder {
    function findGameIndex(
        OPFaultParams memory params,
        uint256 gameCount
    ) external view returns (uint256);
    function gameAtIndex(
        OPFaultParams memory params,
        uint256 gameIndex
    )
        external
        view
        returns (
            uint256 gameType,
            uint256 created,
            IDisputeGame gameProxy,
            uint256 l2BlockNumber,
            bytes32 rootClaim
        );
}

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/interfaces/dispute/IFaultDisputeGame.sol
interface IFaultDisputeGame {
    function l2BlockNumberChallenged() external view returns (bool);
}