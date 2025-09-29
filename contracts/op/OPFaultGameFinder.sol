// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// https://github.com/ethereum-optimism/optimism/issues/11269

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
}

struct FinalizationParams {
    uint256 finalityDelay;
    uint64 gameTypeUpdatedAt;
}

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/src/dispute/lib/Types.sol
uint256 constant CHALLENGER_WINS = 1;
uint256 constant DEFENDER_WINS = 2;

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/interfaces/dispute/IFaultDisputeGame.sol
interface IFaultDisputeGame {
    function l2BlockNumberChallenged() external view returns (bool);
}

// https://github.com/ethereum-optimism/optimism/blob/v1.13.7/packages/contracts-bedrock/src/dispute/lib/Types.sol
uint32 constant GAME_TYPE_CANNON = 0;
uint32 constant GAME_TYPE_PERMISSIONED_CANNON = 1;

error GameNotFound();

contract OPFaultGameFinder {
    function findGameIndex(
        IOptimismPortal portal,
        uint256 minAgeSec,
        uint256[] memory allowedGameTypes,
        uint256 gameCount
    ) external view virtual returns (uint256) {
        FinalizationParams memory finalizationParams = FinalizationParams({
            finalityDelay: portal.disputeGameFinalityDelaySeconds(),
            gameTypeUpdatedAt: portal.respectedGameTypeUpdatedAt()
        });
        IDisputeGameFactory factory = portal.disputeGameFactory();
        if (gameCount == 0) gameCount = factory.gameCount();
        while (gameCount > 0) {
            (
                uint256 gameType,
                uint256 created,
                IDisputeGame gameProxy
            ) = factory.gameAtIndex(--gameCount);
            if (
                _isGameUsable(
                    portal,
                    gameProxy,
                    gameType,
                    created,
                    allowedGameTypes,
                    minAgeSec,
                    finalizationParams
                )
            ) {
                return gameCount;
            }
        }
        revert GameNotFound();
    }

    function gameAtIndex(
        IOptimismPortal portal,
        uint256 minAgeSec,
        uint256[] memory allowedGameTypes,
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
            finalityDelay: portal.disputeGameFinalityDelaySeconds(),
            gameTypeUpdatedAt: portal.respectedGameTypeUpdatedAt()
        });
        IDisputeGameFactory factory = portal.disputeGameFactory();
        (gameType, created, gameProxy) = factory.gameAtIndex(gameIndex);
        if (
            _isGameUsable(
                portal,
                gameProxy,
                gameType,
                created,
                allowedGameTypes,
                minAgeSec,
                finalizationParams
            )
        ) {
            l2BlockNumber = gameProxy.l2BlockNumber();
            rootClaim = gameProxy.rootClaim();
        }
    }

    function _isGameUsable(
        IOptimismPortal portal,
        IDisputeGame gameProxy,
        uint256 gameType,
        uint256 created,
        uint256[] memory allowedGameTypes,
        uint256 minAgeSec,
        FinalizationParams memory finalizationParams
    ) internal view returns (bool) {
        if (!_isAllowedGameType(gameType, allowedGameTypes)) return false;
        // https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html#blacklisting-disputegames
        if (portal.disputeGameBlacklist(gameProxy)) return false;
        if (minAgeSec > 0) {
            if (created > block.timestamp - minAgeSec) return false;
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
}
