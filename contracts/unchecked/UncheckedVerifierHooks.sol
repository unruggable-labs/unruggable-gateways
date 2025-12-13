// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {StandardVerifierHooks} from '../StandardVerifierHooks.sol';

contract UncheckedVerifierHooks is StandardVerifierHooks {
    function verifyAccount(
        bytes32 /*stateRoot*/,
        address /*target*/,
        bytes memory proof
    ) public pure override returns (bytes32, bytes32) {
        return abi.decode(proof, (bytes32, bytes32));
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
