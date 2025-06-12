// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IVerifierHooks} from '../IVerifierHooks.sol';

contract UncheckedVerifierHooks is IVerifierHooks {
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
