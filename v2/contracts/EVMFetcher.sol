// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./GatewayRequest.sol";

library EVMFetcher {

	// notes:
	// * the limits are very high so Overflow() is unlikely
	// * the typical fetch request is incredibly small relative to the proof
	//     so there's no need for data-saving operations (like PUSH_BYTE)
	// * currently, inputs are not embedded into the ops buffer, 
	//     but they could be to further simplify the protocol

	error Overflow();

	function create() internal pure returns (GatewayRequest memory) {
		bytes memory ops = new bytes(MAX_OPS);
		bytes[] memory inputs =  new bytes[](MAX_INPUTS);
		assembly {
			mstore(ops, 1) // the first byte is the number of outputs
			mstore(inputs, 0)
		}
		return GatewayRequest(ops, inputs);
	}
	function encode(GatewayRequest memory req, bytes memory context) internal pure returns (bytes memory) {
		return abi.encodeCall(GatewayAPI.fetch, (context, req));
	}

	function addOp(GatewayRequest memory req, uint8 op) internal pure {
		unchecked {
			bytes memory v = req.ops;
			uint256 n = v.length + 1;
			if (n > MAX_OPS) revert Overflow();
			assembly {
				mstore(v, n)
				mstore8(add(add(v, 31), n), op)
			}
		}
	}
	function addInput(GatewayRequest memory req, bytes memory v) internal pure returns (uint8 ci) {
		unchecked {
			bytes[] memory m = req.inputs;
			uint256 n = m.length + 1;
			if (n > MAX_INPUTS) revert Overflow();
			assembly {
				mstore(m, n) 
				mstore(add(m, shl(5, n)), v)
				ci := sub(n, 1)
			}
		}
	}
	function addOutput(GatewayRequest memory req) internal pure returns (uint8 oi) {
		unchecked {
			bytes memory v = req.ops;
			oi = uint8(v[0]);
			if (oi == MAX_OUTPUTS) revert Overflow();
			v[0] = bytes1(oi + 1);
		}
	}
	
	// path operations
	function target(GatewayRequest memory req) internal pure {
		addOp(req, OP_TARGET);
	}
	function target_first(GatewayRequest memory req) internal pure {
		addOp(req, OP_TARGET_FIRST);
	}

	function collect(GatewayRequest memory req, uint8 step) internal pure returns (uint8) {
		addOp(req, OP_COLLECT);
		addOp(req, step);
		return addOutput(req);
	}
	function collect_first(GatewayRequest memory req, uint8 step) internal pure returns (uint8) {
		addOp(req, OP_COLLECT_FIRST);
		addOp(req, step);
		return addOutput(req);
	}
	
	// slot operations
	function follow(GatewayRequest memory req) internal pure {
		addOp(req, OP_SLOT_FOLLOW);
	}
	function add(GatewayRequest memory req) internal pure {
		addOp(req, OP_SLOT_ADD);
	}
	function set(GatewayRequest memory req) internal pure {
		addOp(req, OP_SLOT_SET);
	}

	// stack operations
	function push_str(GatewayRequest memory req, string memory s) internal pure { push(req, bytes(s)); }
	
	function push(GatewayRequest memory req, uint256 x) internal pure { push(req, abi.encode(x)); }
	function push(GatewayRequest memory req, address x) internal pure { push(req, abi.encode(x)); }
	function push(GatewayRequest memory req, bytes32 x) internal pure { push(req, abi.encode(x)); }
	function push(GatewayRequest memory req, bytes memory v) internal pure {
		addOp(req, OP_PUSH);
		addOp(req, addInput(req, v));
	}
	// this is only useful for very large inputs
	// input size on average is dwarfed by proof size
	function push_input(GatewayRequest memory req, uint8 ci) internal pure {
		addOp(req, OP_PUSH);
		addOp(req, ci);
	}
	function push_output(GatewayRequest memory req, uint8 oi) internal pure {
		addOp(req, OP_PUSH_OUTPUT);
		addOp(req, oi);
	}
	function push_slot(GatewayRequest memory req) internal pure {
		addOp(req, OP_PUSH_SLOT);
	}
	function slice(GatewayRequest memory req, uint8 a, uint8 n) internal pure {
		addOp(req, OP_STACK_SLICE);
		addOp(req, a);
		addOp(req, n);
	}
 	function keccak(GatewayRequest memory req) internal pure {
		addOp(req, OP_STACK_KECCAK);
	}
	function concat(GatewayRequest memory req) internal pure {
		addOp(req, OP_STACK_CONCAT);
	}
	function first(GatewayRequest memory req) internal pure {
		addOp(req, OP_STACK_FIRST);
	}

}
