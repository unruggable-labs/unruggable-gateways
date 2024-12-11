// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IVerifierHooks, InvalidProof, NOT_A_CONTRACT, NULL_CODE_HASH} from '../IVerifierHooks.sol';

// https://github.com/NethermindEth/starknet-state-verifier
// https://github.com/Kelvyne/starknet-storage-proof-solidity
// https://github.com/lfglabs-dev/ens_resolver
// https://docs.starknet.io/documentation/architecture_and_concepts/State/starknet-state/
// https://docs.starknet.io/architecture-and-concepts/cryptography/hash-functions/

interface IPedersen {
	function hash(bytes memory input) external view returns (uint256[] memory output);
}

interface IPoseidon3 {

}

contract StarknetVerifierHooks is IVerifierHooks {
	IPedersen immutable _pederson;
	IPoseidon3 immutable _poseidon;

	constructor(IPedersen pederson, IPoseidon3 poseidon) {
		_pederson = pederson;
		_poseidon = poseidon;
	}

    function verifyAccountState(
        bytes32 stateRoot,
        address target,
        bytes memory encodedProof
    ) external pure returns (bytes32) {
		return 0;
	}

	function verifyStorageValue(
        bytes32 storageRoot,
        address,
        uint256 slot,
        bytes memory encodedProof
    ) external pure returns (bytes32) {
		return 0;
	}

	//function _verifyProof(bytes32 stateRoot, )

}