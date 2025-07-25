// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IVerifierHooks, NOT_A_CONTRACT, NULL_CODE_HASH} from '../IVerifierHooks.sol';
import {SecureMerkleTrie} from './SecureMerkleTrie.sol';
import {RLPReader, RLPReaderExt} from '../RLPReaderExt.sol';

bytes32 constant EMPTY_STORAGE_HASH = keccak256(hex'80'); // see: src/eth/types.ts

contract EthVerifierHooks is IVerifierHooks {
    function verifyAccountState(
        bytes32 stateRoot,
        address target,
        bytes memory proof
    ) external pure returns (bytes32 storageRoot) {
        (bool exists, bytes memory value) = SecureMerkleTrie.get(
            abi.encodePacked(target),
            abi.decode(proof, (bytes[])),
            stateRoot
        );
        if (!exists) return NOT_A_CONTRACT;
        RLPReader.RLPItem[] memory v = RLPReader.readList(value);
        // accountState structure:
        // standard: [nonce, balance, storageRoot, codeHash]
        // blast: [nonce, flags, fixed, shares, remainder, storageRoot, codeHash]
        // generalization: index from the end
        bytes32 codeHash = RLPReaderExt.strictBytes32FromRLP(v[v.length - 1]);
        return
            codeHash == NULL_CODE_HASH
                ? NOT_A_CONTRACT
                : RLPReaderExt.strictBytes32FromRLP(v[v.length - 2]);
    }

    function verifyStorageValue(
        bytes32 storageRoot,
        address /* target */,
        uint256 slot,
        bytes memory proof
    ) external pure returns (bytes32) {
        if (storageRoot == EMPTY_STORAGE_HASH) return bytes32(0);
        (bool exists, bytes memory v) = SecureMerkleTrie.get(
            abi.encodePacked(slot),
            abi.decode(proof, (bytes[])),
            storageRoot
        );
        return
            exists
                ? RLPReaderExt.bytes32FromRLP(RLPReader.readBytes(v))
                : bytes32(0);
    }
}
