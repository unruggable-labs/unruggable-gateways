// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {GatewayRequest} from "./GatewayRequest.sol";
import {IEVMVerifier} from "./IEVMVerifier.sol";
import {EVMProofHelper, StateProof} from "./EVMProofHelper.sol";

import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";
import {Hashing, Types} from "@eth-optimism/contracts-bedrock/src/libraries/Hashing.sol";

interface IL2OutputOracle {
	function latestOutputIndex() external view returns (uint256);
	function getL2Output(uint256 outputIndex) external view returns (Types.OutputProposal memory);
}

contract OPVerifier is IEVMVerifier {

	string[] public gatewayURLs;
	IL2OutputOracle immutable oracle;
	uint256 delay;

	constructor(string[] memory _urls, IL2OutputOracle _oracle, uint256 _delay) {
		gatewayURLs = _urls;
		oracle = _oracle;
		delay = _delay;
	}

	function getStorageContext() external view returns(string[] memory urls, bytes memory context) {
		urls = gatewayURLs;
		context = abi.encode(oracle.latestOutputIndex() - delay);
	}

	function getStorageValues(bytes memory context, GatewayRequest memory req, bytes memory proof) external view returns (bytes[] memory) {
		uint256 outputIndex = abi.decode(context, (uint256));
		(
			Types.OutputRootProof memory outputRootProof, 
			bytes[][] memory accountProofs,
			StateProof[] memory stateProofs
		) = abi.decode(proof, (Types.OutputRootProof, bytes[][], StateProof[]));
		//uint256 outputCount = uint8(req.ops[0]);
		// if (outputCount != stateProofs.length) {
		// 	revert OutputValuesMismatch(outputCount, stateProofs.length);
		// }
		Types.OutputProposal memory output = oracle.getL2Output(outputIndex);
		bytes32 expectedRoot = Hashing.hashOutputRootProof(outputRootProof);
		if (output.outputRoot != expectedRoot) {
			revert OutputRootMismatch(context, expectedRoot, output.outputRoot);
		}
		return EVMProofHelper.getStorageValues(req, outputRootProof.stateRoot, accountProofs, stateProofs);
	}

}
