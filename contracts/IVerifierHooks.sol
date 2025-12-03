// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

bytes32 constant NOT_A_CONTRACT = 0x0000000000000000000000000000000000000000000000000000000000000000;
bytes32 constant NULL_CODE_HASH = keccak256('');

error InvalidProof();

interface IVerifierHooks {
    function verifyAccountState(
        bytes32 stateRoot,
        address target,
        bytes memory proof
    ) external view returns (bytes32 storageRoot);

    function verifyCode(
        bytes32 stateRoot,
        address target,
        bytes memory proof,
        bytes memory code
    ) external view returns (bool);

    function verifyStorageValue(
        bytes32 storageRoot,
        address target,
        uint256 slot,
        bytes memory proof
    ) external view returns (bytes32);
}
