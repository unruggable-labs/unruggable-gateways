// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./EVMFetcher.sol";

library EVMFetcherV1A {

	using EVMFetcher for EVMRequest;

	uint256 constant NO_STEP = 42069; // some number beyond uint8 range

	struct Builder {
		EVMRequest req;
		uint256 step;
	}

	function create(address a) internal pure returns (Builder memory) {
		EVMRequest memory r = EVMFetcher.create();
		r.addOp(OP_PUSH);
		r.addOp(r.addInput(abi.encode(a)));
		r.addOp(OP_TARGET);
		return Builder(r, NO_STEP);
	}

	function end(Builder memory b) internal pure {
		if (b.step != NO_STEP) {
			b.req.addOp(OP_COLLECT);
			b.req.addOp(uint8(b.step));
			b.step = NO_STEP;
		}
	}

	function getStatic(Builder memory b, uint256 slot) internal pure returns (Builder memory) {
		end(b);
		b.req.addOp(OP_PUSH);
		b.req.addOp(b.req.addInput(abi.encode(slot)));
		b.req.addOp(OP_SLOT_ADD);
		return b;
	}

	function toRequest(Builder memory b) internal pure returns (EVMRequest memory) {
		end(b);
		return b.req;
	}


}