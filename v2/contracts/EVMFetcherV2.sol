// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./EVMFetcher.sol";

library EVMFetcherV2 {

	using EVMFetcher for EVMRequest;

	// path operations
	function target(EVMRequest memory req) internal pure {
		req.addOp(OP_TARGET);
	}
	function target_first(EVMRequest memory req) internal pure {
		req.addOp(OP_TARGET_FIRST);
	}

	function collect(EVMRequest memory req, uint8 step) internal pure returns (uint8) {
		req.addOp(OP_COLLECT);
		req.addOp(step);
		return req.addOutput();
	}
	function collect_first(EVMRequest memory req, uint8 step) internal pure returns (uint8) {
		req.addOp(OP_COLLECT_FIRST);
		req.addOp(step);
		return req.addOutput();
	}
	
	// slot operations
	function follow(EVMRequest memory req) internal pure {
		req.addOp(OP_SLOT_FOLLOW);
	}
	function add(EVMRequest memory req) internal pure {
		req.addOp(OP_SLOT_ADD);
	}
	function set(EVMRequest memory req) internal pure {
		req.addOp(OP_SLOT_SET);
	}

	// stack operations
	function push_str(EVMRequest memory req, string memory s) internal pure { push(req, bytes(s)); }
	
	function push(EVMRequest memory req, uint256 x) internal pure { push(req, abi.encode(x)); }
	function push(EVMRequest memory req, address x) internal pure { push(req, abi.encode(x)); }
	function push(EVMRequest memory req, bytes32 x) internal pure { push(req, abi.encode(x)); }
	function push(EVMRequest memory req, bytes memory v) internal pure {
		req.addOp(OP_PUSH);
		req.addOp(req.addInput(v));
	}
	// this is only useful for very large inputs
	// input size on average is dwarfed by proof size
	function push_input(EVMRequest memory req, uint8 ci) internal pure {
		req.addOp(OP_PUSH);
		req.addOp(ci);
	}
	function push_output(EVMRequest memory req, uint8 oi) internal pure {
		req.addOp(OP_PUSH_OUTPUT);
		req.addOp(oi);
	}
	function push_slot(EVMRequest memory req) internal pure {
		req.addOp(OP_PUSH_SLOT);
	}
	function slice(EVMRequest memory req, uint8 a, uint8 n) internal pure {
		req.addOp(OP_STACK_SLICE);
		req.addOp(a);
		req.addOp(n);
	}
	function concat(EVMRequest memory req, uint8 n) internal pure {
		req.addOp(OP_STACK_CONCAT);
		req.addOp(n);
	}
 	function keccak(EVMRequest memory req) internal pure {
		req.addOp(OP_STACK_KECCAK);
	}
	function first(EVMRequest memory req) internal pure {
		req.addOp(OP_STACK_FIRST);
	}

}