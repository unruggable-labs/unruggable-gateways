// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {Hashing, Types} from '../../lib/optimism/packages/contracts-bedrock/src/libraries/Hashing.sol';

interface IL2OutputOracle {
    function latestOutputIndex() external view returns (uint256);
    function getL2Output(
        uint256 outputIndex
    ) external view returns (Types.OutputProposal memory);
    function finalizationPeriodSeconds() external view returns (uint256);
    function submissionInterval() external view returns (uint256);
    function l2BlockTime() external view returns (uint256);
}

contract OPVerifier is AbstractVerifier {
    IL2OutputOracle immutable _oracle;
    uint256 immutable _minAgeSec;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IL2OutputOracle oracle,
        uint256 minAgeSec
    ) AbstractVerifier(urls, window, hooks) {
        _oracle = oracle;
        _minAgeSec = minAgeSec;
    }

    function getLatestContext() external view returns (bytes memory) {
        // Retrieve finalization parameters from the oracle
        uint256 latestIndex = _oracle.latestOutputIndex();
        uint256 finalizationPeriod = _oracle.finalizationPeriodSeconds();
        uint256 submissionInterval = _oracle.submissionInterval();
        uint256 l2BlockTime = _oracle.l2BlockTime();

        // Determine minimum age required for finalization
        uint256 minAgeToUse = _minAgeSec == 0 ? finalizationPeriod : _minAgeSec;

        // Estimate how far back to check
        uint256 indexOffset = minAgeToUse / (submissionInterval * l2BlockTime);
        uint256 validTimestamp = block.timestamp - minAgeToUse;

        uint256 lastValidIndex = type(uint256).max;

        // Use a bounded condition to prevent infinite loops
        while (indexOffset <= latestIndex) {
            // Get approximate output index
            uint256 index = latestIndex - indexOffset;
            if (index == 0) break; // Prevent underflow

            Types.OutputProposal memory output = _oracle.getL2Output(index);

            // If this output is valid
            if (output.timestamp <= validTimestamp) {
                // Track the most recent valid output
                lastValidIndex = index;

                // Move forward to check if a more recent one is also valid
                if (index < latestIndex) {
                    indexOffset--; // Move closer to head and check again
                    continue;
                } else {
                    break; // Already at the latest valid index, return
                }
            } else {
                // If a previous valid output exists, return it
                if (lastValidIndex != type(uint256).max) {
                    return abi.encode(lastValidIndex);
                }

                // Move further back to find a valid output
                indexOffset++;
            }
        }

        revert("OP: no valid output found");
    }

    struct GatewayProof {
        uint256 outputIndex;
        Types.OutputRootProof outputRootProof;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 outputIndex1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        Types.OutputProposal memory output = _oracle.getL2Output(p.outputIndex);
        if (p.outputIndex != outputIndex1) {
            Types.OutputProposal memory output1 = _oracle.getL2Output(
                outputIndex1
            );
            _checkWindow(output1.timestamp, output.timestamp);
        }
        bytes32 computedRoot = Hashing.hashOutputRootProof(p.outputRootProof);
        require(computedRoot == output.outputRoot, 'OP: invalid root');
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(
                    0,
                    p.outputRootProof.stateRoot,
                    p.proofs,
                    p.order,
                    _hooks
                )
            );
    }
}
