// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

uint256 constant MAX_OPS = 256;

uint8 constant MAX_INPUTS = 255;
uint8 constant MAX_OUTPUTS = 255;

uint8 constant OP_TARGET		= 1;
uint8 constant OP_TARGET_FIRST	= 2;

uint8 constant OP_COLLECT		= 5;
uint8 constant OP_COLLECT_FIRST	= 6;

uint8 constant OP_PUSH			= 10;
uint8 constant OP_PUSH_OUTPUT	= 11;
uint8 constant OP_PUSH_SLOT		= 12;

uint8 constant OP_SLOT_ADD		= 20;
uint8 constant OP_SLOT_FOLLOW	= 21;
uint8 constant OP_SLOT_SET		= 22;

uint8 constant OP_STACK_KECCAK	= 30;
uint8 constant OP_STACK_CONCAT	= 31;
uint8 constant OP_STACK_SLICE	= 32;
uint8 constant OP_STACK_FIRST	= 33;

struct EVMRequest {
	bytes ops;
	bytes[] inputs;
}

// the limits are very high so RequestOverflow() is unlikely
// the typical fetch request is incredibly small relative to the proof
// so there's no need for data-saving operations (like PUSH_BYTE)
// currently, inputs are not embedded into the ops buffer
// but they could be to further simplify the protocol
error RequestOverflow();

// this should be unreachable with a valid EVMRequest
error RequestInvalid();

// the request account doesn't exist
// parameter currently removed because TARGET_FIRST has an array
error AccountNotFound(); 

interface GatewayAPI {
	function fetch(bytes memory context, EVMRequest memory req) external pure returns (bytes memory witness);
}
