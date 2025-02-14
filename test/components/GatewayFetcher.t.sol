// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GatewayFetcher, GatewayRequest} from '../../contracts/GatewayFetcher.sol';
import {GatewayVM, ProofSequence, InvalidStackIndex} from '../../contracts/GatewayVM.sol';

import 'forge-std/Test.sol';

contract TestGatewayFetcher is Test {
    using GatewayFetcher for GatewayRequest;

    function test_stack() external {
        evalUint256(R(1).push(true), 1);
        evalUint256(R(1).push(1).pop().stackCount(), 0);
        evalUint256(R(1).pop().stackCount(), 0); // under pop is okay
        evalUint256(R(1).push(2).push(3).swap().pop(), 3);
        evalUint256(R(1).push(1).dup().stackCount(), 2);
        evalUint256(R(1).push(1).push(2).dup(1), 1);
        evalUint256(R(1).push(1).push(2).pushStack(1), 2);
        unchecked {
            evalUint256(
                R(1).push(2).push(3).dup2().pow().pow().pow(),
                2 ** uint256(3 ** uint256(2 ** 3))
            );
        }
        vm.expectRevert();
        evalRequest(R(1).dup());
        vm.expectRevert();
        evalRequest(R(1).swap());
        vm.expectRevert();
        evalRequest(R(1).pushStack(0));
    }

    function test_invalidStackIndex() external {
        vm.expectRevert(abi.encodePacked(InvalidStackIndex.selector, uint256(0), uint256(0), uint256(0)));
        evalRequest(R(0).pushStack(0));
    }

    function test_invalidStackIndex_reversed() external {
        vm.expectRevert(abi.encodePacked(InvalidStackIndex.selector, uint256(0), uint256(0), uint256(1)));
        evalRequest(R(0).dup(0));
    }

    // math
    function testFuzz_plus(uint256 a, uint256 b) external view {
        unchecked {
            evalUint256(R(1).push(a).push(b).plus(), a + b);
        }
    }
    function testFuzz_times(uint256 a, uint256 b) external view {
        unchecked {
            evalUint256(R(1).push(a).push(b).times(), a * b);
        }
    }
    // https://book.getfoundry.sh/cheatcodes/expect-revert
    // https://book.getfoundry.sh/forge/forge-std?highlight=panic#standard-libraries
    function testFuzz_divide(uint256 a, uint256 b) external {
        GatewayRequest memory r = R(1).push(a).push(b).divide();
        if (b == 0) {
            vm.expectRevert(stdError.divisionError);
            evalRequest(r.setOutput(0));
        } else {
            evalUint256(r, a/b);
        }
    }
    function testFuzz_mod(uint256 a, uint256 b) external {
        GatewayRequest memory r = R(1).push(a).push(b).mod();
        if (b == 0) {
            vm.expectRevert(stdError.divisionError);
            evalRequest(r.setOutput(0));
        } else {
            evalUint256(r, a % b);
        }
    }
    function testFuzz_pow(uint256 a, uint256 b) external view {
        unchecked {
            evalUint256(R(1).push(a).push(b).pow(), a ** b);
        }
    }

    // bitwise
    function testFuzz_and(uint256 a, uint256 b) external view {
        evalUint256(R(1).push(a).push(b).and(), a & b);
    }
    function testFuzz_or(uint256 a, uint256 b) external view {
        evalUint256(R(1).push(a).push(b).or(), a | b);
    }
    function testFuzz_xor(uint256 a, uint256 b) external view {
        evalUint256(R(1).push(a).push(b).xor(), a ^ b);
    }
    function testFuzz_shr(uint256 a, uint8 b) external view {
        evalUint256(R(1).push(a).shr(b), a >> b);
    }
    function testFuzz_shl(uint256 a, uint8 b) external view {
        evalUint256(R(1).push(a).shl(b), a << b);
    }
    function testFuzz_not(uint256 x) external view {
        evalUint256(R(1).push(x).not(), ~x);
    }

    // compare
    function testFuzz_eq(uint8 a, uint8 b) external view {
        evalUint256(R(1).push(a).push(b).eq(), a == b ? 1 : 0);
    }
    function testFuzz_lt(uint8 a, uint8 b) external view {
        evalUint256(R(1).push(a).push(b).lt(), a < b ? 1 : 0);
    }
    function testFuzz_gt(uint8 a, uint8 b) external view {
        evalUint256(R(1).push(a).push(b).gt(), a > b ? 1 : 0);
    }
    function test_isZero() external view {
        evalUint256(R(1).push(uint8(0)).isZero(), 1);
        evalUint256(R(1).push(2).isZero(), 0);
        evalUint256(R(1).push(new bytes(63)).isZero(), 1);
    }

    // functions
    function testFuzz_keccak(bytes memory v) external view {
        evalUint256(R(1).push(v).keccak(), uint256(keccak256(v)));
    }
    function testFuzz_concat(bytes memory a, bytes memory b) external view {
        evalBytes(R(1).push(a).push(b).concat(), abi.encodePacked(a, b));
    }
    function testFuzz_slice(bytes calldata v) external {
        uint256 p = vm.randomUint(0, v.length);
        uint256 n = vm.randomUint(0, v.length - p);
        evalBytes(R(1).push(v).slice(p, n), v[p:p + n]);
    }
    function test_slice() external view {
        evalBytes(R(1).push(new bytes(0)).slice(0, 4), new bytes(4));
        evalBytes(R(1).push(new bytes(8)).slice(2, 4), new bytes(4));
        evalBytes(R(1).push(new bytes(2)).slice(4, 4), new bytes(4));
        evalBytes(R(1).push(bytes(hex'1234')).slice(0, 4), hex'12340000');
        evalBytes(R(1).push(bytes(hex'1234')).slice(1, 4), hex'34000000');
    }
    function testFuzz_length(bytes memory v) external view {
        evalUint256(R(1).push(v).length(), v.length);
    }

    // compare (microcode)
    function testFuzz_neq(uint8 a, uint8 b) external view {
        evalUint256(R(1).push(a).push(b).neq(), a != b ? 1 : 0);
    }
    function testFuzz_lte(uint8 a, uint8 b) external view {
        evalUint256(R(1).push(a).push(b).lte(), a <= b ? 1 : 0);
    }
    function testFuzz_gte(uint8 a, uint8 b) external view {
        evalUint256(R(1).push(a).push(b).gte(), a >= b ? 1 : 0);
    }

    // math (microcode)
    function testFuzz_subtract(uint256 a, uint256 b) external view {
        unchecked {
            evalUint256(R(1).push(a).push(b).subtract(), a - b);
        }
    }
    function testFuzz_min(uint256 a, uint256 b) external view {
        evalUint256(R(1).push(a).push(b).min(), a < b ? a : b);
    }
    function testFuzz_max(uint256 a, uint256 b) external view {
        evalUint256(R(1).push(a).push(b).max(), a > b ? a : b);
    }

    // eval
    function test_eval_push() external view {
        evalUint256(R(1).push(1).push(C().push(2).plus()).eval(), 3);
    }
    function test_eval_setOutput() external view {
        evalUint256(
            R(1).push(C().push(1).setOutput(0)).eval().pushOutput(0),
            1
        );
    }
    function test_eval_exit() external view {
        (, uint8 exitCode) = evalRequest(R(1).push(C().exit(1)).eval());
        assertEq(exitCode, 1);
    }
    function test_eval_cond() external {
        vm.expectRevert();
        evalRequest(R(1).push(C().concat()).push(true).evalIf());
        evalRequest(R(1).push(C().concat()).push(false).evalIf());
    }

    // test helpers
    function evalUint256(GatewayRequest memory r, uint256 x) internal view {
        evalBytes(r, abi.encode(x));
    }
    function evalBytes(GatewayRequest memory r, bytes memory v) internal view {
        (bytes[] memory values, uint8 exitCode) = evalRequest(r.setOutput(0));
        assertEq(exitCode, 0);
        assertEq(values.length, 1);
        assertEq(values[0], v);
    }
    function evalRequest(
        GatewayRequest memory r
    ) internal view returns (bytes[] memory outputs, uint8 exitcode) {
        ProofSequence memory ps;
        (outputs, exitcode) = GatewayVM.evalRequest(r, ps);
    }

    // shorthand
    function R(uint8 n) internal pure returns (GatewayRequest memory) {
        return GatewayFetcher.newRequest(n);
    }
    function C() internal pure returns (GatewayRequest memory) {
        return GatewayFetcher.newCommand();
    }
}
