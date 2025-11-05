// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {
    IVerifierHooks,
    InvalidProof,
    NOT_A_CONTRACT,
    NULL_CODE_HASH
} from '../IVerifierHooks.sol';
import {IZKSyncSMT, TreeEntry, ACCOUNT_CODE_HASH} from './IZKSyncSMT.sol';

contract ZKSyncVerifierHooks is IVerifierHooks {
    IZKSyncSMT immutable _smt; // external library with a constructor
    constructor(IZKSyncSMT smt) {
        _smt = smt;
    }

    function verifyAccountState(
        bytes32 root,
        address target,
        bytes memory proof
    ) external view returns (bytes32) {
        // when no account proof is provided, we assume the target is a contract
        // this is safe because zksync uses a single trie and there is no storage root
        return
            proof.length > 0 &&
                _verifyProof(root, ACCOUNT_CODE_HASH, uint160(target), proof) ==
                0
                ? NOT_A_CONTRACT
                : root;
    }

    function verifyCode(
        bytes32 root,
        address target,
        bytes memory proof,
        bytes memory code
    ) external view returns (bool) {
        if (proof.length > 0) {
            return
                _verifyProof(root, ACCOUNT_CODE_HASH, uint160(target), proof) ==
                keccak256(code);
        } else {
            return code.length == 0;
        }
    }

    function verifyStorageValue(
        bytes32 root,
        address target,
        uint256 slot,
        bytes memory proof
    ) external view returns (bytes32) {
        return _verifyProof(root, target, slot, proof);
    }

    function _verifyProof(
        bytes32 root,
        address target,
        uint256 slot,
        bytes memory proof
    ) internal view returns (bytes32) {
        (bytes32 value, uint64 leafIndex, bytes32[] memory path) = abi.decode(
            proof,
            (bytes32, uint64, bytes32[])
        );
        bytes32 computed = _smt.getRootHash(
            path,
            TreeEntry(slot, value, leafIndex),
            target
        );
        if (root != computed) revert InvalidProof();
        return value;
    }
}
