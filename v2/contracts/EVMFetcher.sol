// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./EVMRequest.sol";

library EVMFetcher {
	
	function create() internal pure returns (EVMRequest memory) {
		bytes memory ops = new bytes(MAX_OPS);
		bytes[] memory inputs = new bytes[](MAX_INPUTS);
		assembly {
			mstore(ops, 1) // the first byte is the number of outputs
			mstore(inputs, 0)
		}
		return EVMRequest(ops, inputs);
	}

	function encode(EVMRequest memory req, bytes memory context) internal pure returns (bytes memory) {
		return abi.encodeCall(GatewayAPI.fetch, (context, req));
	}

	function addOp(EVMRequest memory req, uint8 op) internal pure {
		unchecked {
			bytes memory v = req.ops;
			uint256 n = v.length + 1;
			if (n > MAX_OPS) revert RequestOverflow();
			assembly {
				mstore(v, n)
				mstore8(add(add(v, 31), n), op)
			}
		}
	}
	// function addBigOp(EVMRequest memory req, uint24 i) internal pure {
	// 	addOp(req, uint8(i >> 16));
	// 	addOp(req, uint8(i >> 8));
	// 	addOp(req, uint8(i));
	// }

	function addInput(EVMRequest memory req, bytes memory v) internal pure returns (uint8 ci) {
		unchecked {
			bytes[] memory m = req.inputs;
			uint256 n = m.length + 1;
			if (n > MAX_INPUTS) revert RequestOverflow();
			assembly {
				mstore(m, n) 
				mstore(add(m, shl(5, n)), v)
				ci := sub(n, 1)
			}
		}
	}
	
	function addOutput(EVMRequest memory req) internal pure returns (uint8 oi) {
		unchecked {
			bytes memory v = req.ops;
			oi = uint8(v[0]);
			if (oi == MAX_OUTPUTS) revert RequestOverflow();
			v[0] = bytes1(oi + 1);
		}
	}
	
}
