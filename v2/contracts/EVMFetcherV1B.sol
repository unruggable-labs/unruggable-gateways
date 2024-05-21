// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./EVMFetcher.sol";

library EVMFetcherV1B {

	using EVMFetcher for EVMRequest;

	function setTarget(EVMRequest memory r, address a) internal pure returns (EVMRequest memory) {
		r.addOp(OP_PUSH);
		r.addOp(r.addInput(abi.encode(a)));
		r.addOp(OP_TARGET);
		return r;
	}
	function setSlot(EVMRequest memory r, uint256 slot) internal pure returns (EVMRequest memory) {
		r.addOp(OP_PUSH);
		r.addOp(r.addInput(abi.encode(slot)));
		r.addOp(OP_SLOT_SET);
		return r;
	}
	function element(EVMRequest memory r, bytes memory v) internal pure returns (EVMRequest memory) {
		r.addOp(OP_PUSH);
		r.addOp(r.addInput(v));
		r.addOp(OP_SLOT_FOLLOW);
		return r;
	}
	function getBytes32(EVMRequest memory r) internal pure returns (uint8) {
		r.addOp(OP_COLLECT);
		r.addOp(0);
		return r.addOutput();
	}
	function getBytes(EVMRequest memory r) internal pure returns (uint8) {
		r.addOp(OP_COLLECT);
		r.addOp(1);
		return r.addOutput();
	}

}