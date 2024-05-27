// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EVMRequest} from "../EVMRequest.sol";
import {IEVMVerifier} from "../IEVMVerifier.sol";
import {EVMProofHelper, StateProof} from "../EVMProofHelper.sol";

import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";
import {Hashing, Types} from "@eth-optimism/contracts-bedrock/src/libraries/Hashing.sol";

interface IL2OutputOracle {
	function latestOutputIndex() external view returns (uint256);
	function getL2Output(uint256 outputIndex) external view returns (Types.OutputProposal memory);
}

contract OPVerifier is IEVMVerifier {

	IL2OutputOracle immutable _oracle;
	string[] public _urls;
	uint256 public _delay;

	constructor(string[] memory urls, IL2OutputOracle oracle, uint256 delay) {
		_urls = urls;
		_oracle = oracle;
		_delay = delay;
	}

	function getStorageContext() external view returns(string[] memory urls, bytes memory context) {
		urls = _urls;
		context = abi.encode(_oracle.latestOutputIndex() - _delay);
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory) {
		uint256 outputIndex = abi.decode(context, (uint256));
		(
			Types.OutputRootProof memory outputRootProof, 
			bytes[][] memory accountProofs,
			StateProof[] memory stateProofs
		) = abi.decode(proof, (Types.OutputRootProof, bytes[][], StateProof[]));
		Types.OutputProposal memory output = _oracle.getL2Output(outputIndex);
		bytes32 expectedRoot = Hashing.hashOutputRootProof(outputRootProof);
		if (output.outputRoot != expectedRoot) {
			revert OutputRootMismatch(context, expectedRoot, output.outputRoot);
		}
		return EVMProofHelper.getStorageValues(req, outputRootProof.stateRoot, accountProofs, stateProofs);
	}

}
