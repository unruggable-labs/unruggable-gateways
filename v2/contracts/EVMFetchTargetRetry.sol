//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {EVMRequest, AccountNotFound} from "./EVMRequest.sol";
import {IEVMVerifier} from "./IEVMVerifier.sol";
import {EVMFetcher} from "./EVMFetcher.sol";

// derived from https://github.com/resolverworks/OffchainNext.sol
error OffchainLookup(address from, string[] urls, bytes request, bytes4 callback, bytes carry);
error OffchainLookupUnanswered();
error OffchainTryNext();

abstract contract EVMFetchTargetRetry {

	struct Session {
		IEVMVerifier verifier;
		bytes context;
		EVMRequest req;
		bytes4 callback;
		bytes carry;
	}

	function _nextPair(string[] memory urls) internal view returns (string[] memory rest, string[] memory pair) {
		if (urls.length == 0) revert OffchainLookupUnanswered();
		//uint256 index = block.number % urls.length; // FIX ME
		uint256 index = 0;
		rest = new string[](urls.length - 1);
		for (uint256 i; i < index; i += 1) rest[i] = urls[i];
		for (uint256 i = index + 1; i < urls.length; i += 1) rest[i-1] = urls[i];
		pair = new string[](2);
		pair[0] = urls[index];
		pair[1] = "data:application/json,{\"data\":\"0x\"}";
	}

	function _fetch(string[] memory urls, Session memory session) internal view {
		(string[] memory rest, string[] memory pair) = _nextPair(urls);
		revert OffchainLookup(
			address(this),
			pair,
			EVMFetcher.encode(session.req, session.context),
			this.fetchCallback.selector,
			abi.encode(session, rest)
		);
	}

	function fetch(IEVMVerifier verifier, EVMRequest memory req, bytes4 callback, bytes memory carry) internal view {
		(string[] memory urls, bytes memory context) = verifier.getStorageContext();
		_fetch(urls, Session(verifier, context, req, callback, carry));
	}

	function fetchCallback(bytes calldata response, bytes calldata carry) external view {
		(Session memory ses, string[] memory urls) = abi.decode(carry, (Session, string[]));
		if (response.length > 0) {
			try ses.verifier.getStorageValues(ses.context, ses.req, response) returns (bytes[] memory values) {
				(bool ok, bytes memory ret) = address(this).staticcall(abi.encodeWithSelector(ses.callback, values, ses.carry));
				if (ok) {
					assembly { return(add(ret, 32), mload(ret)) }
				} else {
					assembly { revert(add(ret, 32), mload(ret)) }
				}
			} catch (bytes memory ret) {
				if (bytes4(ret) == AccountNotFound.selector) {
					assembly { revert(add(ret, 32), mload(ret)) }
				}
			}
		}
		_fetch(urls, ses);
	}

}
