// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IVerifierHooks} from "./IVerifierHooks.sol";

abstract contract StandardVerifierHooks is IVerifierHooks {

    function verifyAccount(
        bytes32 stateRoot,
        address target,
        bytes memory encodedProof
    ) public virtual view returns (bytes32 storageRoot, bytes32 codeHash);

    function verifyAccountState(
        bytes32 stateRoot,
        address target,
        bytes memory proof
    ) external view returns (bytes32 storageRoot) {
        (storageRoot, ) = verifyAccount(stateRoot, target, proof);
    }

    function verifyCode(
        bytes32 stateRoot,
        address target,
        bytes memory proof,
        bytes memory code
    ) external view returns (bool) {
        (, bytes32 codeHash) = verifyAccount(stateRoot, target, proof);
        return keccak256(code) == codeHash;
    }

}