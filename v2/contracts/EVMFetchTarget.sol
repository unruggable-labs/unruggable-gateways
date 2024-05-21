//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EVMRequest} from "./EVMRequest.sol";
import {IEVMVerifier} from "./IEVMVerifier.sol";
import {EVMFetcher} from "./EVMFetcher.sol";

error OffchainLookup(address from, string[] urls, bytes request, bytes4 callback, bytes carry);

abstract contract EVMFetchTarget {

	struct Session {
		IEVMVerifier verifier;
		bytes context;
		EVMRequest req;
		bytes4 callback;
		bytes carry;
	}

	function fetch(IEVMVerifier verifier, EVMRequest memory req, bytes4 callback, bytes memory carry) internal view {
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
		bytes[] memory values = ses.verifier.getStorageValues(ses.context, ses.req, response);
		(bool ok, bytes memory ret) = address(this).staticcall(abi.encodeWithSelector(ses.callback, values, ses.carry));
		if (ok) {
			assembly { return(add(ret, 32), mload(ret)) }
		} else {
			assembly { revert(add(ret, 32), mload(ret)) }
		}
	}

}
