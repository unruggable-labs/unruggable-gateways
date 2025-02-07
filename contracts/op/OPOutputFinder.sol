// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

// https://github.com/ethereum-optimism/optimism/blob/v1.2.0/packages/contracts-bedrock/src/libraries/Types.sol#L13
struct OutputProposal {
    bytes32 outputRoot;
    uint128 timestamp;
    uint128 l2BlockNumber;
}

// https://github.com/ethereum-optimism/optimism/blob/v1.2.0/packages/contracts-bedrock/src/L1/L2OutputOracle.sol
interface IL2OutputOracle {
    function getL2Output(uint256 outputIndex) external view returns (OutputProposal memory);
    function nextOutputIndex() external view returns (uint256);
    function finalizationPeriodSeconds() external view returns (uint256);
}

// https://github.com/ethereum-optimism/optimism/blob/v1.2.0/packages/contracts-bedrock/src/L1/OptimismPortal.sol
interface IOptimismPortal {
    function l2Oracle() external view returns (IL2OutputOracle);
}

error OutputNotFound();

contract OPOutputFinder {
    function findOutputIndex(IOptimismPortal portal, uint256 minAgeSec) external view virtual returns (uint256) {
        IL2OutputOracle oracle = portal.l2Oracle();
        if (minAgeSec == 0) minAgeSec = oracle.finalizationPeriodSeconds();
        if (minAgeSec > block.timestamp) revert OutputNotFound(); // unlikely
        uint256 t = block.timestamp - minAgeSec;
        uint256 a;
        uint256 b = oracle.nextOutputIndex();
        while (a < b) {
            uint256 mid = (a + b) >> 1;
            if (oracle.getL2Output(mid).timestamp > t) {
                b = mid;
            } else {
                a = mid + 1;
            }
        }
        if (a == 0) revert OutputNotFound();
        return a - 1;
    }

    function getOutput(IOptimismPortal portal, uint256 outputIndex) external view returns (OutputProposal memory) {
        IL2OutputOracle oracle = portal.l2Oracle();
        if (outputIndex >= oracle.nextOutputIndex()) revert OutputNotFound();
        return oracle.getL2Output(outputIndex);
    }
}
