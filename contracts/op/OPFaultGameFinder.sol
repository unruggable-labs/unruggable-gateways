// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {
    IOptimismPortal,
    IDisputeGameFactory,
    IDisputeGame,
    IFaultDisputeGame
} from './OPInterfaces.sol';
import {OPFaultParams} from './OPStructs.sol';

// https://github.com/ethereum-optimism/optimism/issues/11269

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/src/dispute/lib/Types.sol
uint256 constant CHALLENGER_WINS = 1;
uint256 constant DEFENDER_WINS = 2;

error GameNotFound();

contract OPFaultGameFinder {
    function findGameIndex(
        OPFaultParams memory params,
        uint256 gameCount
    ) external view virtual returns (uint256) {
        uint256 respectedGameType = params.portal.respectedGameType();
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
                    respectedGameType
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
        IDisputeGameFactory factory = params.portal.disputeGameFactory();
        (gameType, created, gameProxy) = factory.gameAtIndex(gameIndex);
        if (
            _isGameUsable(
                gameProxy,
                gameType,
                created,
                params,
                params.portal.respectedGameType()
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
        uint256 respectedGameType
    ) internal view returns (bool) {
        // if allowed gameTypes is empty, accept a respected game OR a previously respected game
        if (
            !(
                params.allowedGameTypes.length == 0
                    ? (gameType == respectedGameType ||
                        gameProxy.wasRespectedGameTypeWhenCreated())
                    : _isAllowedGameType(gameType, params.allowedGameTypes)
            )
        ) {
            return false;
        }
        // if no proposer restrictions or proposer is whitelisted
        if (
            !_isAllowedProposer(
                gameProxy.gameCreator(),
                params.allowedProposers
            )
        ) return false;
        // https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html#blacklisting-disputegames
        if (params.portal.disputeGameBlacklist(gameProxy)) return false;
        if (params.minAgeSec > 0) {
            if (created > block.timestamp - params.minAgeSec) return false;
            (bool ok, bytes memory v) = address(gameProxy).staticcall(
                abi.encodeCall(IFaultDisputeGame.l2BlockNumberChallenged, ())
            );
            // effectively: supportsInterface(IFaultDisputeGame)
            if (ok && v.length == 32) {
                return bytes32(v) == bytes32(0); // usable if not challenged
            }
            // fallthru if not IFaultDisputeGame
        }
        return gameProxy.status() == DEFENDER_WINS; // require resolved
    }

    function _isAllowedGameType(
        uint256 gameType,
        uint256[] memory allowedGameTypes
    ) internal pure returns (bool) {
        for (uint256 i; i < allowedGameTypes.length; ++i) {
            if (allowedGameTypes[i] == gameType) return true;
        }
        return false;
    }

    function _isAllowedProposer(
        address proposer,
        address[] memory allowedProposers
    ) internal pure returns (bool) {
        for (uint256 i; i < allowedProposers.length; ++i) {
            if (allowedProposers[i] == proposer) return true;
        }
        return allowedProposers.length == 0;
    }
}
