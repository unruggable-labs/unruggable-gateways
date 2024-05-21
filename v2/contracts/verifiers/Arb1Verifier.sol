// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EVMRequest} from "../EVMRequest.sol";
import {IEVMVerifier} from "../IEVMVerifier.sol";
import {EVMProofHelper, StateProof} from "../EVMProofHelper.sol";

import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";
import {Node, IRollupCore} from "@arbitrum/nitro-contracts/src/rollup/IRollupCore.sol";

contract Arb1Verifier is IEVMVerifier {

	string[] public gatewayURLs;
	IRollupCore immutable rollup;

	constructor(string[] memory _urls, IRollupCore _rollup) {
		gatewayURLs = _urls;
		rollup = _rollup;
	}

	function getStorageContext() external view returns(string[] memory urls, bytes memory context) {
		urls = gatewayURLs;
		context = abi.encode(rollup.latestNodeCreated());
	}

	function getStorageValues(bytes memory context, EVMRequest memory req, bytes memory proof) external view returns (bytes[] memory) {
		uint64 nodeNum = abi.decode(context, (uint64));
		(
			bytes32 sendRoot,
			bytes memory rlpEncodedBlock,
			bytes[][] memory accountProofs,
			StateProof[] memory stateProofs
		) = abi.decode(proof, (bytes32, bytes, bytes[][], StateProof[]));
		Node memory node = rollup.getNode(nodeNum);
 		bytes32 confirmData = keccak256(abi.encodePacked(keccak256(rlpEncodedBlock), sendRoot));
		if (confirmData != node.confirmData) {
			revert OutputRootMismatch(context, confirmData, node.confirmData);
		}
		bytes32 stateRoot = getStateRootFromBlock(rlpEncodedBlock);
		return EVMProofHelper.getStorageValues(req, stateRoot, accountProofs, stateProofs);
	}

	function getStateRootFromBlock(bytes memory rlpEncodedBlock) internal pure returns (bytes32) {
		RLPReader.RLPItem[] memory v = RLPReader.readList(rlpEncodedBlock);
		return bytes32(RLPReader.readBytes(v[3]));
	}

}
