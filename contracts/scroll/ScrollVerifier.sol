// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';

interface IScrollChain {
    function lastFinalizedBatchIndex() external view returns (uint256);
    function finalizedStateRoots(
        uint256 batchIndex
    ) external view returns (bytes32);
}

contract ScrollVerifier is AbstractVerifier {
    IScrollChain immutable _rollup;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IScrollChain rollup
    ) AbstractVerifier(urls, window, hooks) {
        _rollup = rollup;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(_rollup.lastFinalizedBatchIndex());
    }

    struct GatewayProof {
        uint256 batchIndex;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 batchIndex1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        _checkWindow(batchIndex1, p.batchIndex);
        bytes32 stateRoot = _rollup.finalizedStateRoots(p.batchIndex);
        require(stateRoot != bytes32(0), 'Scroll: not finalized');
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence({
                    index: 0,
                    stateRoot: stateRoot,
                    proofs: p.proofs,
                    order: p.order,
                    hooks: _hooks
                })
            );
    }
}
