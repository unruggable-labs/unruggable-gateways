// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {NitroVerifierLib} from './NitroVerifierLib.sol';
import {BoLDVerifierLib} from './BoLDVerifierLib.sol';

contract ArbitrumVerifier is AbstractVerifier {
    address public immutable rollup;
    uint256 public immutable minAgeBlocks;
    bool public immutable isBoLD;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        address _rollup,
        uint256 _minAgeBlocks,
        bool _isBoLD
    ) AbstractVerifier(urls, window, hooks) {
        rollup = _rollup;
        minAgeBlocks = _minAgeBlocks;
        isBoLD = _isBoLD;
    }

    function getLatestContext() external view returns (bytes memory) {
        return
            abi.encode(
                isBoLD
                    ? BoLDVerifierLib.latestIndex(rollup, minAgeBlocks)
                    : NitroVerifierLib.latestIndex(rollup, minAgeBlocks)
            );
    }

    struct GatewayProof {
        bytes rollupProof;
        bytes[] proofs;
        bytes order;
    }

    function _verifyRollup(
        GatewayProof memory p,
        bytes memory context
    ) internal view returns (bytes32 stateRoot) {
        uint256 latest = abi.decode(context, (uint256));
        uint256 got;
        if (isBoLD) {
            (stateRoot, got) = BoLDVerifierLib.verifyRollup(
                rollup,
                minAgeBlocks,
                p.rollupProof
            );
        } else {
            (stateRoot, latest, got) = NitroVerifierLib.verifyRollup(
                rollup,
                minAgeBlocks,
                p.rollupProof,
                uint64(latest)
            );
        }
        _checkWindow(latest, got);
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view virtual returns (bytes[] memory, uint8 exitCode) {
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        bytes32 stateRoot = _verifyRollup(p, context);
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
