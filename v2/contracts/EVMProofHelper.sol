// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./EVMRequest.sol";
import {RLPReader} from "@eth-optimism/contracts-bedrock/src/libraries/rlp/RLPReader.sol";
import {Bytes} from "@eth-optimism/contracts-bedrock/src/libraries/Bytes.sol";
import {SecureMerkleTrie} from "./trie-with-nonexistance/SecureMerkleTrie.sol";

import "forge-std/console2.sol"; // DEBUG

struct StateProof {
	uint256 accountIndex;
	//uint8 accountIndex;
	//address account;
	bytes[][] storageProofs;
}


struct VMState {
	uint256 pos;
	EVMRequest req;
	uint256 slot;
	uint256 stackIndex;
	uint256 proofIndex;
	uint256 outputIndex;
	address target;
	bytes32 storageRoot;
	bytes[] stack;
	bytes[] outputs;
}

library EVMProofHelper {

	bytes32 constant NULL_TRIE_ROOT = 0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421;

	// utils
	function uint256_from_bytes(bytes memory v) internal pure returns (uint256) {
		return uint256(v.length < 32 ? bytes32(v) >> ((32 - v.length) << 3) : bytes32(v));
	}
	function is_zero(bytes memory v) internal pure returns (bool ret) {
		assembly {
			let p := add(v, 32)
			let e := add(p, mload(v))
			for { ret := 1 } lt(p, e) { p := add(p, 32) } {
				if iszero(iszero(mload(p))) { // != 0
					ret := 0
					break
				}
			}
		}
	}

	// proof verification
	function getStorageRoot(bytes32 stateRoot, address target, bytes[] memory witness) private pure returns (bytes32) {
		(bool exists, bytes memory v) = SecureMerkleTrie.get(abi.encodePacked(target), witness, stateRoot);
		if (!exists) return NULL_TRIE_ROOT; // TODO: is this ever false? is this safe?
		RLPReader.RLPItem[] memory accountState = RLPReader.readList(v);
		return bytes32(RLPReader.readBytes(accountState[2]));
	}
	function getSingleStorageProof(bytes32 storageRoot, uint256 slot, bytes[] memory witness) private pure returns (bytes memory) {
		(bool exists, bytes memory v) = SecureMerkleTrie.get(abi.encodePacked(slot), witness, storageRoot);
		return exists ? RLPReader.readBytes(v) : bytes('');
	}
	function getStorage(bytes32 storageRoot, uint256 slot, bytes[] memory witness) private pure returns (uint256) {
		return uint256_from_bytes(getSingleStorageProof(storageRoot, slot, witness));
	}
	function proveOutput(bytes32 storageRoot, bytes[][] memory storageProofs, uint256 slot, uint256 step) internal pure returns (bytes memory v) {
		uint256 first = getStorage(storageRoot, slot, storageProofs[0]);
		if (step == 0) return abi.encode(first);
		uint256 size;
		if (step == 1 && (first & 1) == 0) {
			size = (first & 0xFF) >> 1;
			v = new bytes(size);
			assembly { mstore(add(v, 32), first) }
		} else {
			size = (first >> 1) * step; // number of bytes
			first = (size + 31) >> 5; // rename: number of slots
			slot = uint256(keccak256(abi.encode(slot))); // array start
			v = new bytes(size);
			uint256 i;
			while (i < first) {
				i += 1;
				uint256 value = getStorage(storageRoot, slot, storageProofs[i]);
				assembly { mstore(add(v, shl(5, i)), value) }
				slot += 1;
			}
		}
	}
	function proveOutputRange(bytes32 storageRoot, bytes[][] memory storageProofs, uint256 slot, uint256 count) internal pure returns (bytes memory v) {
		v = new bytes(count << 5);
		for (uint256 i; i < count; ) {
			uint256 value = getStorage(storageRoot, slot + i, storageProofs[i]);
			i += 1;
			assembly { mstore(add(v, shl(5, i)), value) }
		}
	}

	using EVMProofHelper for VMState;

	// VMState
	function push(VMState memory state, bytes memory v) internal pure {
		state.stack[state.stackIndex++] = v;
	}
	function pop(VMState memory state) internal pure returns (bytes memory) {
		return state.stack[--state.stackIndex];
	}
	function pop_uint256(VMState memory state) internal pure returns (uint256) {
		return uint256_from_bytes(pop(state));
	}
	function pop_address(VMState memory state) internal pure returns (address) {
		return address(uint160(pop_uint256(state)));
	}	
	function add_output(VMState memory state, bytes memory v) internal pure {
		state.outputs[state.outputIndex++] = v;
	}
	function has_ops(VMState memory state) internal pure returns (bool) {
		return state.pos < state.req.ops.length;
	}
	function next_op(VMState memory state) internal pure returns (uint8) {
		return uint8(state.req.ops[state.pos++]);
	}
	function dump(VMState memory state) internal pure {
		console2.log("[pos=%s root=%s slot=%s proof=%s]", state.pos, state.slot, state.proofIndex);
		console2.logBytes(state.req.ops);
		for (uint256 i; i < state.stackIndex; i++) {
			console2.log("[stack=%s size=%s]", i, state.stack[i].length);
			console2.logBytes(state.stack[i]);
		}
	}

	function getStorageValues(EVMRequest memory req, bytes32 stateRoot, bytes[][] memory accountProofs, StateProof[] memory stateProofs) internal pure returns(bytes[] memory) {
		//console2.log("[accounts=%s states=%s]", accountProofs.length, stateProofs.length);
		VMState memory state;
		state.req = req;
		state.stack = new bytes[](MAX_STACK);
		state.outputs = new bytes[](state.next_op());
		while (state.has_ops()) {
			uint256 op = state.next_op();
			if (op == OP_TARGET) {
				state.target = state.pop_address();
				state.storageRoot = getStorageRoot(stateRoot, state.target, accountProofs[stateProofs[state.proofIndex].accountIndex]);
				if (state.storageRoot == NULL_TRIE_ROOT) revert AccountNotFound();
				state.slot = 0;
			} else if (op == OP_TARGET_FIRST) {
				state.storageRoot = NULL_TRIE_ROOT;
				while (state.stackIndex != 0 && state.storageRoot == NULL_TRIE_ROOT) {
					state.target = state.pop_address();
					state.storageRoot = getStorageRoot(stateRoot, state.target, accountProofs[stateProofs[state.proofIndex++].accountIndex]);
				}
				if (state.storageRoot == NULL_TRIE_ROOT) revert AccountNotFound();
				state.stackIndex = 0;
				state.slot = 0;
			} else if (op == OP_COLLECT_FIRST) {
				uint8 step = state.next_op();
				bytes memory v;
				while (state.stackIndex != 0 && v.length == 0) {
					v = proveOutput(state.storageRoot, stateProofs[state.proofIndex++].storageProofs, state.pop_uint256(), step);
					if (is_zero(v)) v = '';
				}
				state.add_output(v);
				state.stackIndex = 0;
				state.slot = 0;
			} else if (op == OP_COLLECT_RANGE) {
				state.add_output(proveOutputRange(state.storageRoot, stateProofs[state.proofIndex++].storageProofs, state.slot, state.next_op()));
				state.slot = 0;
			} else if (op == OP_COLLECT) {
				state.add_output(proveOutput(state.storageRoot, stateProofs[state.proofIndex++].storageProofs, state.slot, state.next_op()));
				state.slot = 0;
			} else if (op == OP_PUSH) {
				state.push(abi.encodePacked(req.inputs[state.next_op()]));
			} else if (op == OP_PUSH_OUTPUT) {
				state.push(abi.encodePacked(state.outputs[state.next_op()]));
			} else if (op == OP_PUSH_SLOT) {
				state.push(abi.encode(state.slot));
			} else if (op == OP_PUSH_TARGET) {
				state.push(abi.encode(state.target));
			} else if (op == OP_SLOT_ADD) {
				state.slot += state.pop_uint256();
			} else if (op == OP_SLOT_SET) {
				state.slot = state.pop_uint256();
			} else if (op == OP_SLOT_FOLLOW) {
				state.slot = uint256(keccak256(abi.encodePacked(state.pop(), state.slot)));
			} else if (op == OP_STACK_SLICE) {
				state.push(Bytes.slice(state.pop(), state.next_op(), state.next_op()));
			} else if (op == OP_STACK_KECCAK) {
				state.push(abi.encodePacked(keccak256(state.pop())));
			} else if (op == OP_STACK_CONCAT) { // [..., a, b] => [..., a+b]
				bytes memory v = state.pop();
				state.push(abi.encodePacked(state.pop(), v));
			} else if (op == OP_STACK_FIRST) {
				bytes memory v;
				while (state.stackIndex != 0 && v.length == 0) {
					v = state.pop();
					if (is_zero(v)) v = '';
				}
				state.stackIndex = 0;
				state.push(v);
			} else {
				revert RequestInvalid();
			}
		}
		return state.outputs;
	}


}