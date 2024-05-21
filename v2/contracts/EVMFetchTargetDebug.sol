//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

abstract contract EVMFetchTargetDebug {

	// EXPERIMENTAL
	// other ideas: return (values, request, carry)
	
	function echoCallback(bytes[] calldata v, bytes calldata) external pure returns (bytes[] memory) {
		return v;
	}

}