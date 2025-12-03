// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {
    Hashing,
    Types
} from '../../lib/optimism/packages/contracts-bedrock/src/libraries/Hashing.sol';

interface IOPOutputFinder {
    function findOutputIndex(
        address portal,
        uint256 minAgeSec
    ) external view returns (uint256);
    function getOutput(
        address portal,
        uint256 outputIndex
    ) external view returns (Types.OutputProposal memory);
}

contract OPVerifier is AbstractVerifier {
    address immutable _portal;
    IOPOutputFinder immutable _outputFinder;
    uint256 immutable _minAgeSec;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        address portal,
        IOPOutputFinder outputFinder,
        uint256 minAgeSec
    ) AbstractVerifier(urls, window, hooks) {
        _portal = portal;
        _outputFinder = outputFinder;
        _minAgeSec = minAgeSec;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(_outputFinder.findOutputIndex(_portal, _minAgeSec));
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
        Types.OutputProposal memory output = _outputFinder.getOutput(
            _portal,
            p.outputIndex
        );
        if (p.outputIndex != outputIndex1) {
            Types.OutputProposal memory output1 = _outputFinder.getOutput(
                _portal,
                outputIndex1
            );
            _checkWindow(output1.timestamp, output.timestamp);
            // NOTE: no addtional checks are required
            // newer outputs will fail window check
            // older outputs will be older (by definition)
            // therefore, older finalized outputs are also finalized
        }
        bytes32 computedRoot = Hashing.hashOutputRootProof(p.outputRootProof);
        require(computedRoot == output.outputRoot, 'OP: invalid root');
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence({
                    index: 0,
                    stateRoot: p.outputRootProof.stateRoot,
                    proofs: p.proofs,
                    order: p.order,
                    hooks: _hooks
                })
            );
    }
}
