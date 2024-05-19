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

struct GatewayRequest {
	bytes ops;
	bytes[] inputs;
}

interface GatewayAPI {
	function fetch(bytes memory context, GatewayRequest memory req) external pure returns (bytes memory witness);
}

error InvalidGatewayRequest();

error AccountNotFound();
