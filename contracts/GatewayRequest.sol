// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

struct GatewayRequest {
    bytes ops;
}

library EvalFlag {
    uint8 constant STOP_ON_SUCCESS = 1 << 0;
    uint8 constant STOP_ON_FAILURE = 1 << 1;
    uint8 constant ACQUIRE_STATE = 1 << 2;
    uint8 constant KEEP_ARGS = 1 << 3;
}

library GatewayOP {
    uint8 constant PUSH_0 = 0;
    uint8 constant PUSH_1 = 1;
    uint8 constant PUSH_2 = 2;
    uint8 constant PUSH_3 = 3;
    uint8 constant PUSH_4 = 4;
    uint8 constant PUSH_5 = 5;
    uint8 constant PUSH_6 = 6;
    uint8 constant PUSH_7 = 7;
    uint8 constant PUSH_8 = 8;
    uint8 constant PUSH_9 = 9;
    uint8 constant PUSH_10 = 10;
    uint8 constant PUSH_11 = 11;
    uint8 constant PUSH_12 = 12;
    uint8 constant PUSH_13 = 13;
    uint8 constant PUSH_14 = 14;
    uint8 constant PUSH_15 = 15;
    uint8 constant PUSH_16 = 16;
    uint8 constant PUSH_17 = 17;
    uint8 constant PUSH_18 = 18;
    uint8 constant PUSH_19 = 19;
    uint8 constant PUSH_20 = 20;
    uint8 constant PUSH_21 = 21;
    uint8 constant PUSH_22 = 22;
    uint8 constant PUSH_23 = 23;
    uint8 constant PUSH_24 = 24;
    uint8 constant PUSH_25 = 25;
    uint8 constant PUSH_26 = 26;
    uint8 constant PUSH_27 = 27;
    uint8 constant PUSH_28 = 28;
    uint8 constant PUSH_29 = 29;
    uint8 constant PUSH_30 = 30;
    uint8 constant PUSH_31 = 31;
    uint8 constant PUSH_32 = 32;

    uint8 constant GET_SLOT = 33;
    uint8 constant GET_TARGET = 34;
    uint8 constant STACK_SIZE = 35;
	uint8 constant IS_CONTRACT = 36;

    uint8 constant PUSH_BYTES = 40;
    uint8 constant PUSH_STACK = 41;
    uint8 constant PUSH_OUTPUT = 42;

    uint8 constant SET_TARGET = 50;
    uint8 constant SET_OUTPUT = 51;
    uint8 constant EVAL_LOOP = 52;
    uint8 constant EVAL = 53;
    uint8 constant ASSERT = 54;

    uint8 constant READ_SLOT = 60;
    uint8 constant READ_BYTES = 61;
    uint8 constant READ_ARRAY = 62;
    uint8 constant READ_HASHED_BYTES = 63;
    uint8 constant READ_SLOTS = 64;

    uint8 constant SET_SLOT = 70;
    uint8 constant ADD_SLOT = 71;
    uint8 constant FOLLOW = 72;

    uint8 constant DUP = 80;
    uint8 constant POP = 81;
    uint8 constant SWAP = 82;

    uint8 constant KECCAK = 90;
    uint8 constant CONCAT = 91;
    uint8 constant SLICE = 92;
    uint8 constant LENGTH = 93;
    uint8 constant CHUNK = 94;

    uint8 constant PLUS = 100;
    uint8 constant TIMES = 101;
    uint8 constant DIVIDE = 102;
    uint8 constant MOD = 103;
	uint8 constant POW = 104;

    uint8 constant AND = 110;
    uint8 constant OR = 111;
    uint8 constant XOR = 112;
    uint8 constant SHIFT_LEFT = 113;
    uint8 constant SHIFT_RIGHT = 114;
    uint8 constant NOT = 115;

    uint8 constant IS_ZERO = 120;
    uint8 constant EQ = 121;
    uint8 constant LT = 122;
    uint8 constant GT = 123;

    uint8 constant DEBUG = 255;
}
