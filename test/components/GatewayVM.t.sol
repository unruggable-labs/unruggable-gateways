// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GatewayVM} from '../../contracts/GatewayVM.sol';

import 'forge-std/Test.sol';

contract TestGatewayVM is Test {
    function test_isZeros() external pure {
        for (uint256 i = 0; i < 65; i++) {
            bytes memory v = new bytes(i);
            assertEq(GatewayVM.isZeros(v), true);
            if (i > 0) {
                v[i - 1] = hex'01';
                assertEq(GatewayVM.isZeros(v), false);
            }
        }
    }

    function test_isZeros_withCruft() external pure {
        for (uint256 i = 1; i < 100; i++) {
            bytes memory v = new bytes(i);
            assembly {
                mstore8(add(add(v, 32), i), 1) // v[-1] = 1 (beyond bounds)
            }
            assertEq(GatewayVM.isZeros(v), true);
        }
    }

    function testFuzz_smallKeccak(bytes32 x) external pure {
        assertEq(GatewayVM.smallKeccak(x), keccak256(abi.encode(x)));
    }
}
