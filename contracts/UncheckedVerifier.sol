// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IGatewayVerifier} from './IGatewayVerifier.sol';
import {IVerifierHooks} from './IVerifierHooks.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from './GatewayVM.sol';

contract UncheckedVerifier is IGatewayVerifier, IVerifierHooks {
    string[] _urls;

    constructor(string[] memory urls) {
        _urls = urls;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(block.number);
    }

    function gatewayURLs() external view returns (string[] memory) {
        return _urls;
    }

    function getStorageValues(
        bytes memory /*context*/,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory values, uint8 exitCode) {
        (bytes[] memory proofs, bytes memory order) = abi.decode(
            proof,
            (bytes[], bytes)
        );
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, bytes32(0), proofs, order, this)
            );
    }

    function verifyAccountState(
        bytes32 /*stateRoot*/,
        address /*target*/,
        bytes memory proof
    ) external pure returns (bytes32 storageRoot) {
        return bytes32(proof);
    }

    function verifyStorageValue(
        bytes32 /*storageRoot*/,
        address /*target*/,
        uint256 /*slot*/,
        bytes memory proof
    ) external pure returns (bytes32) {
        return bytes32(proof);
    }
}
