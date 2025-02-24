// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier} from '../AbstractVerifier.sol';
import {IVerifierHooks} from '../IVerifierHooks.sol';
import {ArbitrumRollup} from './ArbitrumRollup.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';

contract ArbitrumVerifier is AbstractVerifier {
    address immutable _rollup;
    uint256 immutable _minAgeBlocks;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        address rollup,
        uint256 minAgeBlocks
    ) AbstractVerifier(urls, window, hooks) {
        _rollup = rollup;
        _minAgeBlocks = minAgeBlocks;
    }

    function isBoLD() external view returns (bool) {
        return ArbitrumRollup.isBoLD(_rollup);
    }

    function getLatestContext() external view returns (bytes memory) {
        return ArbitrumRollup.getLatestContext(_rollup, _minAgeBlocks);
    }

    struct GatewayProof {
        bytes rollupProof;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view virtual returns (bytes[] memory, uint8 exitCode) {
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        bytes32 stateRoot = ArbitrumRollup.verifyStateRoot(
            _rollup,
            _minAgeBlocks,
            _window,
            p.rollupProof,
            context
        );
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, stateRoot, p.proofs, p.order, _hooks)
            );
    }
}
