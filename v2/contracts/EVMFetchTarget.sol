//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {GatewayRequest} from "./GatewayRequest.sol";
import {IEVMVerifier} from "./IEVMVerifier.sol";
import {EVMFetcher} from "./EVMFetcher.sol";

error OffchainLookup(address from, string[] urls, bytes request, bytes4 callback, bytes carry);

abstract contract EVMFetchTarget {

	struct Session {
		IEVMVerifier verifier;
		bytes context;
		GatewayRequest req;
		bytes4 callback;
		bytes carry;
	}

	function fetch(IEVMVerifier verifier, GatewayRequest memory req, bytes4 callback, bytes memory carry) internal view {
		(string[] memory urls, bytes memory context) = verifier.getStorageContext();
		revert OffchainLookup(
			address(this),
			urls,
			EVMFetcher.encode(req, context),
			this.fetchCallback.selector,
			abi.encode(Session(verifier, context, req, callback, carry))
		);
	}

	function fetchCallback(bytes calldata response, bytes calldata carry) external view {
		Session memory ses = abi.decode(carry, (Session));
		bytes[] memory values = ses.verifier.getStorageValues(ses.context, ses.req, response); // abi.decode(response, (bytes)));
		(bool ok, bytes memory ret) = address(this).staticcall(abi.encodeWithSelector(ses.callback, values, ses.carry));
		/*
		//if (values.length != expected) revert OffchainTryNext();
		(bool ok, bytes memory ret) = address(this).staticcall(abi.encodeWithSelector(ses.callback, values, ses.carry));
		if (!ok) revert OffchainTryNext();
		*/
		if (ok) {
			assembly { return(add(ret, 32), mload(ret)) }
		} else {
			assembly { revert(add(ret, 32), mload(ret)) }
		}
	}

	// EXPERIMENTAL
	// other ideas: return (values, request, carry)
	function echoCallback(bytes[] calldata v, bytes calldata) external pure returns (bytes[] memory) {
		return v;
	}

}
