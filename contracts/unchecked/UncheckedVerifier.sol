// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';

contract UncheckedVerifier is AbstractVerifier {
    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks
    ) AbstractVerifier(urls, window, hooks) {}

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(block.timestamp);
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory values, uint8 exitCode) {
        uint256 t1 = abi.decode(context, (uint256));
        (uint256 t, bytes[] memory proofs, bytes memory order) = abi.decode(
            proof,
            (uint256, bytes[], bytes)
        );
        _checkWindow(t1, t);
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, bytes32(0), proofs, order, _hooks)
            );
    }
}
