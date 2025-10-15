// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IOptimismPortal, IDisputeGameFactory, IDisputeGame, IFaultDisputeGame } from './OPInterfaces.sol';
import { OPFaultParams, FinalizationParams } from './OPStructs.sol';

// https://github.com/ethereum-optimism/optimism/issues/11269

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/src/dispute/lib/Types.sol
uint256 constant CHALLENGER_WINS = 1;
uint256 constant DEFENDER_WINS = 2;

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/src/dispute/lib/Types.sol
uint32 constant GAME_TYPE_CANNON = 0;
uint32 constant GAME_TYPE_PERMISSIONED_CANNON = 1;

error GameNotFound();

contract OPFaultGameFinder {
    function findGameIndex(
        OPFaultParams memory params,
        uint256 gameCount
    ) external view virtual returns (uint256) {
        FinalizationParams memory finalizationParams = FinalizationParams({
            finalityDelay: params.portal.disputeGameFinalityDelaySeconds(),
            gameTypeUpdatedAt: params.portal.respectedGameTypeUpdatedAt()
        });
        IDisputeGameFactory factory = params.portal.disputeGameFactory();
        if (gameCount == 0) gameCount = factory.gameCount();
        while (gameCount > 0) {
            (
                uint256 gameType,
                uint256 created,
                IDisputeGame gameProxy
            ) = factory.gameAtIndex(--gameCount);
            if (
                _isGameUsable(
                    gameProxy,
                    gameType,
                    created,
                    params,
                    finalizationParams
                )
            ) {
                return gameCount;
            }
        }
        revert GameNotFound();
    }

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
        )
    {
        FinalizationParams memory finalizationParams = FinalizationParams({
            finalityDelay: params.portal.disputeGameFinalityDelaySeconds(),
            gameTypeUpdatedAt: params.portal.respectedGameTypeUpdatedAt()
        });
        IDisputeGameFactory factory = params.portal.disputeGameFactory();
        (gameType, created, gameProxy) = factory.gameAtIndex(gameIndex);
        if (
            _isGameUsable(
                gameProxy,
                gameType,
                created,
                params,
                finalizationParams
            )
        ) {
            l2BlockNumber = gameProxy.l2BlockNumber();
            rootClaim = gameProxy.rootClaim();
        }
    }

    function _isGameUsable(
        IDisputeGame gameProxy,
        uint256 gameType,
        uint256 created,
        OPFaultParams memory params,
        FinalizationParams memory finalizationParams
    ) internal view returns (bool) {
        if (!_isAllowedGameType(gameType, params.allowedGameTypes)) return false;
        if (!_isAllowedProposer(gameProxy.gameCreator(), params.allowedProposers)) return false;
        // https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html#blacklisting-disputegames
        if (params.portal.disputeGameBlacklist(gameProxy)) return false;
        if (!gameProxy.wasRespectedGameTypeWhenCreated()) return false;
        if (params.minAgeSec > 0) {
            if (created > block.timestamp - params.minAgeSec) return false;
            if (
                gameType == GAME_TYPE_CANNON ||
                gameType == GAME_TYPE_PERMISSIONED_CANNON
            ) {
                return IFaultDisputeGame(address(gameProxy))
                        .l2BlockNumberChallenged() ? false : true;
            }
            // Testing for an unchallenged game falls back to finalized mode if unknown game type
        }

        if (
            created > finalizationParams.gameTypeUpdatedAt &&
            gameProxy.status() == DEFENDER_WINS
        ) {
            return ((block.timestamp - gameProxy.resolvedAt()) >
                finalizationParams.finalityDelay);
        }
        return false;
    }

    function _isAllowedGameType(uint256 gameType, uint256[] memory allowedGameTypes) pure internal returns (bool) {
        for (uint i = 0; i < allowedGameTypes.length; i++) {
            if (allowedGameTypes[i] == gameType) return true;
        }
        return false;
    }

    function _isAllowedProposer(address proposer, address[] memory allowedProposers) pure internal returns (bool) {
        if (allowedProposers.length == 0) return true;

        for (uint i = 0; i < allowedProposers.length; i++) {
            if (allowedProposers[i] == proposer) return true;
        }
        return false;
    }
}
