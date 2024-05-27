// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./EVMRequest.sol";

library EVMFetcher {

	using EVMFetcher for EVMRequest;
	
	function create() internal pure returns (EVMRequest memory) {
		bytes memory ops = new bytes(MAX_OPS);
		bytes[] memory inputs = new bytes[](MAX_INPUTS);
		assembly {
			mstore(ops, 1) // the first byte is the number of outputs
			mstore(inputs, 0)
		}
		return EVMRequest(ops, inputs);
	}

	function encode(EVMRequest memory r, bytes memory context) internal pure returns (bytes memory) {
		return abi.encodeCall(GatewayAPI.fetch, (context, r));
	}

	function addOp(EVMRequest memory r, uint8 op) internal pure returns (EVMRequest memory) {
		unchecked {
			bytes memory v = r.ops;
			uint256 n = v.length + 1;
			if (n > MAX_OPS) revert RequestOverflow();
			assembly {
				mstore(v, n)
				mstore8(add(add(v, 31), n), op)
			}
			return r;
		}
	}

	// function addBigOp(EVMRequest memory r, uint24 i) internal pure {
	// 	r.addOp(uint8(i >> 16));
	// 	r.addOp(uint8(i >> 8));
	// 	r.addOp(uint8(i));
	// }

	function addInput(EVMRequest memory r, bytes memory v) internal pure returns (uint8 ii) {
		unchecked {
			bytes[] memory m = r.inputs;
			uint256 n = m.length + 1;
			if (n > MAX_INPUTS) revert RequestOverflow();
			assembly {
				mstore(m, n) 
				mstore(add(m, shl(5, n)), v)
				ii := sub(n, 1)
			}
		}
	}

	function addOutput(EVMRequest memory r) internal pure returns (EVMRequest memory) {
		unchecked {
			bytes memory v = r.ops;
			uint8 oi = uint8(v[0]);
			if (oi == MAX_OUTPUTS) revert RequestOverflow();
			v[0] = bytes1(oi + 1);
			return r;
		}
	}
	function outputCount(EVMRequest memory r) internal pure returns (uint8) {
		return uint8(r.ops[0]);
	}

	function target(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addOp(OP_TARGET); }
	function firstTarget(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addOp(OP_TARGET_FIRST); }
	function setTarget(EVMRequest memory r, address a) internal pure returns (EVMRequest memory) { return r.push(a).target(); }

	function collect(EVMRequest memory r, uint8 step) internal pure returns (EVMRequest memory) { return r.addOp(OP_COLLECT).addOp(step).addOutput(); }
	function getValue(EVMRequest memory r) internal pure returns (EVMRequest memory) { r.collect(0); return r; }
	function getBytes(EVMRequest memory r) internal pure returns (EVMRequest memory) { r.collect(STEP_BYTES); return r; }

	function collectFirstNonzero(EVMRequest memory r, uint8 step) internal pure returns (EVMRequest memory) { return r.addOp(OP_COLLECT_FIRST).addOp(step).addOutput(); }
	function getFirstNonzeroValue(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.collectFirstNonzero(0); }
	function getFirstNonzeroBytes(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.collectFirstNonzero(STEP_BYTES); }

	function getValues(EVMRequest memory r, uint8 n) internal pure returns (EVMRequest memory) { return r.addOp(OP_COLLECT_RANGE).addOp(n).addOutput(); }
	
	function push(EVMRequest memory r, uint256 x) internal pure returns (EVMRequest memory) { return push(r, abi.encode(x)); }
	function push(EVMRequest memory r, address x) internal pure returns (EVMRequest memory) { return push(r, abi.encode(x)); }
	function push(EVMRequest memory r, bytes32 x) internal pure returns (EVMRequest memory) { return push(r, abi.encode(x)); }
	function push(EVMRequest memory r, string memory s) internal pure returns (EVMRequest memory) { return push(r, bytes(s)); }
	function push(EVMRequest memory r, bytes memory v) internal pure returns (EVMRequest memory) { 
		return r.addOp(OP_PUSH_INPUT).addOp(r.addInput(v)); 
	}
	
	function pushInput(EVMRequest memory r, uint8 ii) internal pure returns (EVMRequest memory) { return r.addOp(OP_PUSH_INPUT).addOp(ii); }
	function pushOutput(EVMRequest memory r, uint8 oi) internal pure returns (EVMRequest memory) { return r.addOp(OP_PUSH_OUTPUT).addOp(oi); }
	function pushStack(EVMRequest memory r, uint8 si) internal pure returns (EVMRequest memory) { return r.addOp(OP_PUSH_STACK).addOp(si); }
	function pushSlotRegister(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addOp(OP_PUSH_SLOT); }
	function pushTargetRegister(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addOp(OP_PUSH_TARGET); }

	function add(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addOp(OP_SLOT_ADD); }
	function add(EVMRequest memory r, uint256 x) internal pure returns (EVMRequest memory) { return r.push(x).add(); }

	function set(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addOp(OP_SLOT_SET); }	
	function set(EVMRequest memory r, uint256 x) internal pure returns (EVMRequest memory) { return r.push(x).set(); }

	function follow(EVMRequest memory r) internal pure returns (EVMRequest memory) { return r.addOp(OP_SLOT_FOLLOW); }
	function follow(EVMRequest memory r, uint256 x) internal pure returns (EVMRequest memory) { return r.push(x).follow(); }
	function follow(EVMRequest memory r, bytes32 x) internal pure returns (EVMRequest memory) { return r.push(x).follow(); }
	function follow(EVMRequest memory r, address x) internal pure returns (EVMRequest memory) { return r.push(x).follow(); }
	function follow(EVMRequest memory r, string memory s) internal pure returns (EVMRequest memory) { return r.push(s).follow(); }
	function follow(EVMRequest memory r, bytes memory v) internal pure returns (EVMRequest memory) { return r.push(v).follow(); }

	function concat(EVMRequest memory r, uint8 n) internal pure returns (EVMRequest memory) {
		return r.addOp(OP_STACK_CONCAT).addOp(n);
	}
 	function keccak(EVMRequest memory r) internal pure returns (EVMRequest memory) {
		return r.addOp(OP_STACK_KECCAK);
	}
	function slice(EVMRequest memory r, uint8 pos, uint8 len) internal pure returns (EVMRequest memory) {
		return r.addOp(OP_STACK_SLICE).addOp(pos).addOp(len);
	}
	function replaceWithFirstNonzero(EVMRequest memory r) internal pure returns (EVMRequest memory) {
		return r.addOp(OP_STACK_FIRST);
	}

}
