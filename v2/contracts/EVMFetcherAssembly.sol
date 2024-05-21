// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./EVMFetcher.sol";

library EVMFetcherAssembly {

	using EVMFetcher for EVMRequest;

	// path operations
	function target(EVMRequest memory req) internal pure {
		addOp(req, OP_TARGET);
	}
	function target_first(EVMRequest memory req) internal pure {
		addOp(req, OP_TARGET_FIRST);
	}

	function collect(EVMRequest memory req, uint8 step) internal pure returns (uint8) {
		addOp(req, OP_COLLECT);
		addOp(req, step);
		return addOutput(req);
	}
	function collect_first(EVMRequest memory req, uint8 step) internal pure returns (uint8) {
		addOp(req, OP_COLLECT_FIRST);
		addOp(req, step);
		return addOutput(req);
	}
	
	// slot operations
	function follow(EVMRequest memory req) internal pure {
		addOp(req, OP_SLOT_FOLLOW);
	}
	function add(EVMRequest memory req) internal pure {
		addOp(req, OP_SLOT_ADD);
	}
	function set(EVMRequest memory req) internal pure {
		addOp(req, OP_SLOT_SET);
	}

	// stack operations
	function push_str(EVMRequest memory req, string memory s) internal pure { push(req, bytes(s)); }
	
	function push(EVMRequest memory req, uint256 x) internal pure { push(req, abi.encode(x)); }
	function push(EVMRequest memory req, address x) internal pure { push(req, abi.encode(x)); }
	function push(EVMRequest memory req, bytes32 x) internal pure { push(req, abi.encode(x)); }
	function push(EVMRequest memory req, bytes memory v) internal pure {
		addOp(req, OP_PUSH);
		addOp(req, addInput(req, v));
	}
	// this is only useful for very large inputs
	// input size on average is dwarfed by proof size
	function push_input(EVMRequest memory req, uint8 ci) internal pure {
		addOp(req, OP_PUSH);
		addOp(req, ci);
	}
	function push_output(EVMRequest memory req, uint8 oi) internal pure {
		addOp(req, OP_PUSH_OUTPUT);
		addOp(req, oi);
	}
	function push_slot(EVMRequest memory req) internal pure {
		addOp(req, OP_PUSH_SLOT);
	}
	function slice(EVMRequest memory req, uint8 a, uint8 n) internal pure {
		addOp(req, OP_STACK_SLICE);
		addOp(req, a);
		addOp(req, n);
	}
	function concat(EVMRequest memory req, uint8 n) internal pure {
		addOp(req, OP_STACK_CONCAT);
		addOp(req, n);
	}
 	function keccak(EVMRequest memory req) internal pure {
		addOp(req, OP_STACK_KECCAK);
	}
	function first(EVMRequest memory req) internal pure {
		addOp(req, OP_STACK_FIRST);
	}

}