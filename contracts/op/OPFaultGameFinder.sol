// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// https://github.com/ethereum-optimism/optimism/issues/11269

// https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/L1/OptimismPortal.sol
interface IOptimismPortal {
    function disputeGameFactory() external view returns (IDisputeGameFactory);
    function respectedGameType() external view returns (uint256);
    function disputeGameBlacklist(
        IDisputeGame game
    ) external view returns (bool);
    function disputeGameFinalityDelaySeconds() external view returns (uint256);
    function respectedGameTypeUpdatedAt() external view returns (uint64);
}

// https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/dispute/interfaces/IDisputeGameFactory.sol
interface IDisputeGameFactory {
    function gameCount() external view returns (uint256);
    function gameAtIndex(
        uint256 index
    )
        external
        view
        returns (uint256 gameType, uint256 created, IDisputeGame gameProxy);
}

// https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/dispute/interfaces/IDisputeGame.sol
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

// https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/dispute/lib/Types.sol#L7
uint256 constant CHALLENGER_WINS = 1;
uint256 constant DEFENDER_WINS = 2;

error GameNotFound();
error InvalidGameTypeBitMask();

contract OPFaultGameFinder {
    function findGameIndex(
        IOptimismPortal portal,
        uint256 minAgeSec,
        uint256 gameTypeBitMask,
        uint256 gameCount
    ) external view virtual returns (uint256) {
        gameTypeBitMask = _gameTypeBitMask(portal, gameTypeBitMask);
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
                    gameTypeBitMask,
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
        uint256 gameTypeBitMask,
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
        gameTypeBitMask = _gameTypeBitMask(portal, gameTypeBitMask);
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
                gameTypeBitMask,
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
        uint256 gameTypeBitMask,
        uint256 minAgeSec,
        FinalizationParams memory finalizationParams
    ) internal view returns (bool) {
        if (gameType > 255) return false;
        if (gameTypeBitMask & (1 << gameType) == 0) return false;
        // https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html#blacklisting-disputegames
        if (portal.disputeGameBlacklist(gameProxy)) return false;
        if (minAgeSec == 0) {
            if (created > finalizationParams.gameTypeUpdatedAt && gameProxy.status() == DEFENDER_WINS) {
                return ((block.timestamp - gameProxy.resolvedAt()) > finalizationParams.finalityDelay);
            }
            return false;
        } else {
            return
                created <= block.timestamp - minAgeSec &&
                gameProxy.status() != CHALLENGER_WINS;
        }
    }

    function _gameTypeBitMask(
        IOptimismPortal portal,
        uint256 mask
    ) internal view returns (uint256) {
        if (mask == 0) {
            // use respected game type
            mask = 1 << portal.respectedGameType();
            if (mask == 0) revert InvalidGameTypeBitMask();
        }
        return mask;
    }
}
