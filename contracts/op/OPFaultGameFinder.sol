// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {
    IDisputeGameFactory,
    IDisputeGame,
    IFaultDisputeGame,
    IOPSuccinctFaultDisputeGame
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
        uint256 gameBound
    ) external view virtual returns (uint256) {
        uint256 respectedGameType = params.asr.respectedGameType();
        IDisputeGameFactory dgf = params.asr.disputeGameFactory();
        if (gameBound == 0) gameBound = dgf.gameCount();
        while (gameBound > 0) {
            (uint256 gameType, uint256 created, IDisputeGame gameProxy) = dgf
                .gameAtIndex(--gameBound);
            if (
                _isGameUsable(
                    gameProxy,
                    gameType,
                    created,
                    params,
                    respectedGameType
                )
            ) {
                return gameBound;
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
        IDisputeGameFactory dgf = params.asr.disputeGameFactory();
        (gameType, created, gameProxy) = dgf.gameAtIndex(gameIndex);
        if (
            _isGameUsable(
                gameProxy,
                gameType,
                created,
                params,
                params.asr.respectedGameType()
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
        // https://specs.optimism.io/fault-proof/stage-one/anchor-state-registry.html#proper-game
        if (!params.asr.isGameProper(gameProxy)) return false;
        if (params.minAgeSec > 0) {
            if (created > block.timestamp - params.minAgeSec) return false;
            if (_isUnchallenged(gameProxy)) return true;
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

    /// @dev Attempt to determine if the game is challenged in any sense.
    function _isUnchallenged(
        IDisputeGame gameProxy
    ) internal view returns (bool) {
        try
            IFaultDisputeGame(address(gameProxy)).l2BlockNumberChallenged()
        returns (bool challenged) {
            return !challenged;
        } catch {}
        try IFaultDisputeGame(address(gameProxy)).claimDataLen() returns (
            uint256 claims
        ) {
            return claims == 1;
        } catch {}
        try
            IOPSuccinctFaultDisputeGame(address(gameProxy)).claimData()
        returns (IOPSuccinctFaultDisputeGame.ClaimData memory data) {
            return
                data.status ==
                IOPSuccinctFaultDisputeGame.ProposalStatus.Unchallenged;
        } catch {}
        return false;
    }
}
