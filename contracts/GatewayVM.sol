// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GatewayRequest, GatewayOP, EvalFlag} from './GatewayRequest.sol';
import {IVerifierHooks, InvalidProof, NOT_A_CONTRACT} from './IVerifierHooks.sol';
import {Bytes} from '../lib/optimism/packages/contracts-bedrock/src/libraries/Bytes.sol'; // Bytes.slice

import {console} from 'forge-std/console.sol'; // DEBUG

struct ProofSequence {
    uint256 index;
    bytes32 stateRoot;
    bytes[] proofs;
    bytes order;
    IVerifierHooks hooks;
}

error InvalidRequest();
error InvalidStackIndex(uint256 index, uint256 count, bool reversed);
error InvalidOutputIndex(uint256 index, uint256 count);
error StackOverflow();

// current limit is 256 because of stackBits
uint256 constant MAX_STACK = 256;

library GatewayVM {
    function dump(Machine memory vm, string memory label) internal view {
        console.log('DEBUG(%s)', label);
        console.log('[pos=%s/%s]', vm.pos, vm.buf.length);
        if (vm.buf.length < 256) console.logBytes(vm.buf); // prevent spam
        console.log('[target=%s slot=%s]', vm.target, vm.slot);
        console.log('[proof=%s/%s]', vm.proofs.index, vm.proofs.order.length);
        console.log('[stackSize=%s]', vm.stackSize);
        for (uint256 i; i < vm.stackSize; i++) {
            bytes memory v = vm.stackAsBytes(i);
            console.log('%s [size=%s raw=%s]', i, v.length, vm.isStackRaw(i));
            console.logBytes(v);
        }
        uint256 mem;
        assembly {
            mem := mload(64)
        }
        console.log('[memory=%s gas=%s]', mem, gasleft());
    }

    function smallKeccak(bytes32 x) internal pure returns (bytes32 ret) {
        assembly {
            mstore(0, x)
            ret := keccak256(0, 32)
        }
    }

    function isZeros(bytes memory v) internal pure returns (bool ret) {
        assembly {
            let p := add(v, 32) // start of v
            let e := add(p, mload(v)) // end of v
            let x
            ret := 1 // assume zero
            // while (p < e)
            for {

            } lt(p, e) {

            } {
                x := mload(p) // remember last
                p := add(p, 32) // step by word
                if x {
                    ret := 0 // x is nonzero => return false
                    break
                }
            }
            // we checked beyond bound and failed
            if and(gt(p, e), iszero(ret)) {
                ret := iszero(shr(shl(3, sub(p, e)), x)) // shift off extra and recheck
            }
        }
    }

    struct Machine {
        bytes buf;
        uint256 pos;
        uint256[] stack;
        uint256 stackSize;
        uint256 stackBits;
        address target;
        bytes32 storageRoot;
        uint256 slot;
        ProofSequence proofs;
    }

    using GatewayVM for Machine;

    function pushBoolean(Machine memory vm, bool x) internal pure {
        vm.pushUint256(x ? 1 : 0);
    }

    function pushUint256(Machine memory vm, uint256 x) internal pure {
        vm.push(x, true);
    }

    function pushBytes(Machine memory vm, bytes memory v) internal pure {
        uint256 x;
        assembly {
            x := v // bytes => ptr
        }
        vm.push(x, false);
    }

    function push(Machine memory vm, uint256 x, bool raw) internal pure {
        if (vm.stackSize == MAX_STACK) revert StackOverflow();
        uint256 i = vm.stackSize++;
        if (vm.isStackRaw(i) != raw) vm.stackBits ^= 1 << i;
        vm.stack[i] = x;
    }

    function isStackRaw(
        Machine memory vm,
        uint256 i
    ) internal pure returns (bool) {
        return (vm.stackBits & (1 << i)) != 0;
    }

    function isStackZeros(
        Machine memory vm,
        uint256 i
    ) internal pure returns (bool) {
        return
            vm.isStackRaw(i)
                ? vm.stackAsUint256(i) == 0
                : isZeros(vm.stackAsBytes(i));
    }

    function stackAsUint256(
        Machine memory vm,
        uint256 i
    ) internal pure returns (uint256 x) {
        x = vm.stack[i];
        if (!vm.isStackRaw(i)) {
            uint256 n;
            assembly {
                n := mload(x) // length
                x := mload(add(x, 32)) // first 32 bytes w/right pad
                if lt(n, 32) {
                    x := shr(shl(3, sub(32, n)), x) // remove right pad
                }
            }
        }
    }

    function stackAsBytes(
        Machine memory vm,
        uint256 i
    ) internal pure returns (bytes memory v) {
        uint256 x = vm.stack[i];
        if (vm.isStackRaw(i)) {
            v = abi.encode(x);
        } else {
            assembly {
                v := x // ptr => bytes
            }
        }
    }

    function popAsUint256(Machine memory vm) internal pure returns (uint256) {
        return vm.stackAsUint256(vm.pop());
    }

    function popAsBytes(
        Machine memory vm
    ) internal pure returns (bytes memory) {
        return vm.stackAsBytes(vm.pop());
    }

    function pop(Machine memory vm) internal pure returns (uint256) {
        return vm.stackSize = vm.checkBack(0);
    }

    function checkBack(
        Machine memory vm,
        uint256 back
    ) internal pure returns (uint256) {
        if (back >= vm.stackSize) {
            revert InvalidStackIndex(back, vm.stackSize, true);
        }
        unchecked {
            return vm.stackSize - 1 - back;
        }
    }

    function checkRead(
        Machine memory vm,
        uint256 n
    ) internal pure returns (uint256 ptr) {
        uint256 pos = vm.pos;
        bytes memory buf = vm.buf;
        uint256 end = pos + n;
        if (end > buf.length) revert InvalidRequest();
        vm.pos = end;
        assembly {
            ptr := add(add(buf, 32), pos) // ptr of start in vm.buf
        }
    }

    function readByte(Machine memory vm) internal pure returns (uint8 i) {
        uint256 src = vm.checkRead(1);
        assembly {
            i := shr(248, mload(src)) // read one byte
        }
    }

    function readUint(
        Machine memory vm,
        uint256 n
    ) internal pure returns (uint256 x) {
        if (n == 0) return 0;
        if (n > 32) revert InvalidRequest();
        uint256 src = vm.checkRead(n);
        assembly {
            x := shr(shl(3, sub(32, n)), mload(src)) // remove right pad
        }
    }

    function readBytes(
        Machine memory vm,
        uint256 n
    ) internal pure returns (bytes memory v) {
        v = Bytes.slice(vm.buf, vm.pos, n); // throws on overflow
        vm.pos += n;
    }

    function readProof(Machine memory vm) internal pure returns (bytes memory) {
        ProofSequence memory p = vm.proofs;
        return p.proofs[uint8(p.order[p.index++])];
    }

    function getStorageRoot(Machine memory vm) internal view returns (bytes32) {
        return
            vm.proofs.hooks.verifyAccountState(
                vm.proofs.stateRoot,
                vm.target,
                vm.readProof()
            );
    }

    function getStorage(
        Machine memory vm,
        uint256 slot
    ) internal view returns (uint256) {
        bytes memory proof = vm.readProof();
        if (vm.storageRoot == NOT_A_CONTRACT) return 0;
        return
            uint256(
                vm.proofs.hooks.verifyStorageValue(
                    vm.storageRoot,
                    vm.target,
                    slot,
                    proof
                )
            );
    }

    function proveSlots(
        Machine memory vm,
        uint256 count
    ) internal view returns (bytes memory v) {
        v = new bytes(count << 5); // memory for count slots
        for (uint256 i; i < count; ) {
            uint256 value = vm.getStorage(vm.slot + i);
            assembly {
                i := add(i, 1)
                mstore(add(v, shl(5, i)), value) // append(value)
            }
        }
    }

    function proveBytes(
        Machine memory vm
    ) internal view returns (bytes memory v) {
        uint256 first = vm.getStorage(vm.slot);
        if ((first & 1) == 0) {
            // small
            v = new bytes((first & 0xFF) >> 1);
            assembly {
                mstore(add(v, 32), first) // set first 32 bytes
            }
        } else {
            // large
            uint256 size = first >> 1; // number of bytes
            first = (size + 31) >> 5; // number of slots
            v = new bytes(size);
            uint256 slot = uint256(smallKeccak(bytes32(vm.slot))); // array start
            for (uint256 i; i < first; ) {
                uint256 value = vm.getStorage(slot + i);
                assembly {
                    i := add(i, 1)
                    mstore(add(v, shl(5, i)), value) // append(value)
                }
            }
        }
    }

    function proveArray(
        Machine memory vm,
        uint256 step
    ) internal view returns (bytes memory v) {
        uint256 first = vm.getStorage(vm.slot);
        uint256 count;
        if (step < 32) {
            uint256 per = 32 / step;
            count = (first + per - 1) / per;
        } else {
            count = first * ((step + 31) >> 5);
        }
        v = new bytes((1 + count) << 5); // +1 for length
        assembly {
            mstore(add(v, 32), first) // store length
        }
        uint256 slot = uint256(smallKeccak(bytes32(vm.slot))); // array start
        for (uint256 i; i < count; ) {
            uint256 value = vm.getStorage(slot + i);
            assembly {
                i := add(i, 1)
                mstore(add(v, shl(5, add(i, 1))), value) // append(value)
            }
        }
    }

    function createMachine() internal pure returns (Machine memory vm) {
        vm.pos = 0;
        vm.stack = new uint256[](MAX_STACK);
        vm.stackBits = 0;
        vm.stackSize = 0;
        vm.target = address(0);
        vm.storageRoot = NOT_A_CONTRACT;
        vm.slot = 0;
    }

    function evalRequest(
        GatewayRequest memory req,
        ProofSequence memory proofs
    ) external view returns (bytes[] memory outputs, uint8 exitCode) {
        Machine memory vm = createMachine();
        vm.buf = req.ops;
        vm.proofs = proofs;
        outputs = new bytes[](vm.readByte()); // NOTE: implies maximum outputs is 255
        exitCode = vm.evalCommand(outputs);
    }

    function evalCommand(
        Machine memory vm,
        bytes[] memory outputs
    ) internal view returns (uint8 /*exitCode*/) {
        while (vm.pos < vm.buf.length) {
            //uint256 g = gasleft();
            uint8 op = vm.readByte();
            if (op <= GatewayOP.PUSH_32) {
                vm.pushUint256(vm.readUint(op));
            } else if (op == GatewayOP.PUSH_BYTES) {
                vm.pushBytes(vm.readBytes(vm.readUint(vm.readByte())));
            } else if (op == GatewayOP.SET_TARGET) {
                vm.target = address(uint160(vm.popAsUint256()));
                vm.storageRoot = vm.getStorageRoot();
                vm.slot = 0;
            } else if (op == GatewayOP.SET_OUTPUT) {
                uint256 i = vm.popAsUint256();
                if (i >= outputs.length) {
                    revert InvalidOutputIndex(i, outputs.length);
                }
                outputs[i] = vm.popAsBytes();
            } else if (op == GatewayOP.ASSERT) {
                uint8 exitCode = vm.readByte();
                if (vm.isStackZeros(vm.pop())) return exitCode;
            } else if (op == GatewayOP.READ_SLOT) {
                vm.pushBytes(vm.proveSlots(1));
            } else if (op == GatewayOP.READ_SLOTS) {
                vm.pushBytes(vm.proveSlots(vm.popAsUint256()));
            } else if (op == GatewayOP.READ_BYTES) {
                vm.pushBytes(vm.proveBytes());
            } else if (op == GatewayOP.READ_HASHED_BYTES) {
                bytes memory v = vm.readProof();
                if (keccak256(v) != bytes32(vm.popAsUint256())) {
                    revert InvalidProof();
                }
                vm.pushBytes(v);
            } else if (op == GatewayOP.READ_ARRAY) {
                vm.pushBytes(vm.proveArray(vm.popAsUint256()));
            } else if (op == GatewayOP.SET_SLOT) {
                vm.slot = vm.popAsUint256();
            } else if (op == GatewayOP.ADD_SLOT) {
                vm.slot += vm.popAsUint256();
            } else if (op == GatewayOP.FOLLOW) {
                vm.slot = uint256(
                    keccak256(abi.encodePacked(vm.popAsBytes(), vm.slot))
                );
            } else if (op == GatewayOP.PUSH_STACK) {
                uint256 i = vm.popAsUint256();
                if (i >= vm.stackSize) {
                    revert InvalidStackIndex(i, vm.stackSize, false);
                }
                vm.push(vm.stack[i], vm.isStackRaw(i));
            } else if (op == GatewayOP.PUSH_OUTPUT) {
                uint256 i = vm.popAsUint256();
                if (i >= outputs.length) {
                    revert InvalidOutputIndex(i, outputs.length);
                }
                vm.pushBytes(outputs[i]);
            } else if (op == GatewayOP.GET_SLOT) {
                vm.pushUint256(vm.slot);
            } else if (op == GatewayOP.GET_TARGET) {
                vm.pushBytes(abi.encodePacked(vm.target)); // NOTE: 20 bytes
            } else if (op == GatewayOP.STACK_SIZE) {
                vm.pushUint256(vm.stackSize);
            } else if (op == GatewayOP.IS_CONTRACT) {
                vm.pushBoolean(vm.storageRoot != NOT_A_CONTRACT);
            } else if (op == GatewayOP.DUP) {
                uint256 i = vm.checkBack(vm.popAsUint256());
                vm.push(vm.stack[i], vm.isStackRaw(i));
            } else if (op == GatewayOP.POP) {
                if (vm.stackSize > 0) --vm.stackSize;
            } else if (op == GatewayOP.SWAP) {
                uint256 i = vm.checkBack(vm.popAsUint256());
                uint256 j = vm.checkBack(0);
                (vm.stack[i], vm.stack[j]) = (vm.stack[j], vm.stack[i]);
                if (vm.isStackRaw(i) != vm.isStackRaw(j)) {
                    vm.stackBits ^= (1 << i) | (1 << j);
                }
            } else if (op == GatewayOP.SLICE) {
                uint256 size = vm.popAsUint256();
                uint256 pos = vm.popAsUint256();
                bytes memory v = vm.popAsBytes();
                uint256 end = pos + size;
                if (end <= v.length) {
                    vm.pushBytes(Bytes.slice(v, pos, size));
                } else if (pos >= v.length) {
                    vm.pushBytes(new bytes(size)); // beyond end
                } else {
                    vm.pushBytes(
                        bytes.concat(
                            Bytes.slice(v, pos, v.length - pos), // partial
                            new bytes(end - v.length)
                        )
                    );
                }
            } else if (op == GatewayOP.KECCAK) {
                uint256 i = vm.pop();
                if (vm.isStackRaw(i)) {
                    vm.pushUint256(
                        uint256(smallKeccak(bytes32(vm.stackAsUint256(i))))
                    );
                } else {
                    vm.pushUint256(uint256(keccak256(vm.stackAsBytes(i))));
                }
            } else if (op == GatewayOP.LENGTH) {
                uint256 i = vm.pop();
                vm.pushUint256(
                    vm.isStackRaw(i) ? 32 : vm.stackAsBytes(i).length
                );
            } else if (op == GatewayOP.CHUNK) {
                uint256 chunk = vm.popAsUint256();
                bytes memory v = vm.popAsBytes();
                if (chunk > 0) {
                    uint256 end = v.length - (v.length % chunk);
                    while (end >= chunk) {
                        vm.pushBytes(Bytes.slice(v, end - chunk, chunk));
                        end -= chunk;
                    }
                }
            } else if (op == GatewayOP.CONCAT) {
                bytes memory last = vm.popAsBytes();
                vm.pushBytes(bytes.concat(vm.popAsBytes(), last));
            } else if (op == GatewayOP.PLUS) {
                uint256 last = vm.popAsUint256();
                unchecked {
                    vm.pushUint256(vm.popAsUint256() + last);
                }
            } else if (op == GatewayOP.TIMES) {
                uint256 last = vm.popAsUint256();
                unchecked {
                    vm.pushUint256(vm.popAsUint256() * last);
                }
            } else if (op == GatewayOP.DIVIDE) {
                uint256 last = vm.popAsUint256();
                unchecked {
                    vm.pushUint256(vm.popAsUint256() / last); // revert on 0
                }
            } else if (op == GatewayOP.MOD) {
                uint256 last = vm.popAsUint256();
                vm.pushUint256(vm.popAsUint256() % last); // revert on 0
            } else if (op == GatewayOP.POW) {
                uint256 last = vm.popAsUint256();
                unchecked {
                    vm.pushUint256(vm.popAsUint256() ** last);
                }
            } else if (op == GatewayOP.AND) {
                uint256 last = vm.popAsUint256();
                vm.pushUint256(vm.popAsUint256() & last);
            } else if (op == GatewayOP.OR) {
                uint256 last = vm.popAsUint256();
                vm.pushUint256(vm.popAsUint256() | last);
            } else if (op == GatewayOP.XOR) {
                uint256 last = vm.popAsUint256();
                vm.pushUint256(vm.popAsUint256() ^ last);
            } else if (op == GatewayOP.SHIFT_LEFT) {
                vm.pushUint256(vm.popAsUint256() << vm.popAsUint256());
            } else if (op == GatewayOP.SHIFT_RIGHT) {
                vm.pushUint256(vm.popAsUint256() >> vm.popAsUint256());
            } else if (op == GatewayOP.EQ) {
                uint256 last = vm.popAsUint256();
                vm.pushBoolean(vm.popAsUint256() == last);
            } else if (op == GatewayOP.LT) {
                uint256 last = vm.popAsUint256();
                vm.pushBoolean(vm.popAsUint256() < last);
            } else if (op == GatewayOP.GT) {
                uint256 last = vm.popAsUint256();
                vm.pushBoolean(vm.popAsUint256() > last);
            } else if (op == GatewayOP.NOT) {
                vm.pushUint256(~vm.popAsUint256());
            } else if (op == GatewayOP.IS_ZERO) {
                vm.pushBoolean(vm.isStackZeros(vm.pop()));
            } else if (op == GatewayOP.EVAL) {
                bool cond = !vm.isStackZeros(vm.pop());
                bytes memory program = vm.popAsBytes();
                if (cond) {
                    (uint256 pos, bytes memory buf) = (vm.pos, vm.buf); // save program
                    vm.buf = program;
                    vm.pos = 0;
                    uint8 exitCode = vm.evalCommand(outputs);
                    if (exitCode != 0) return exitCode;
                    (vm.pos, vm.buf) = (pos, buf); // restore program
                }
            } else if (op == GatewayOP.EVAL_LOOP) {
                uint8 flags = vm.readByte();
                uint256 count = vm.popAsUint256();
                Machine memory vm2 = createMachine();
                vm2.buf = vm.popAsBytes();
                vm2.proofs = vm.proofs;
                if (count > vm.stackSize) count = vm.stackSize;
                while (count > 0) {
                    --count;
                    vm2.target = vm.target;
                    vm2.storageRoot = vm.storageRoot;
                    vm2.slot = vm.slot;
                    vm2.pos = 0;
                    vm2.stackSize = 0;
                    uint256 i = vm.pop();
                    vm2.push(vm.stack[i], vm.isStackRaw(i));
                    if (
                        (flags &
                            (
                                vm2.evalCommand(outputs) != 0
                                    ? EvalFlag.STOP_ON_FAILURE
                                    : EvalFlag.STOP_ON_SUCCESS
                            )) != 0
                    ) {
                        if ((flags & EvalFlag.KEEP_ARGS) == 0) {
                            vm.stackSize -= count;
                        }
                        if ((flags & EvalFlag.ACQUIRE_STATE) != 0) {
                            vm.target = vm2.target;
                            vm.storageRoot = vm2.storageRoot;
                            vm.slot = vm2.slot;
                            for (i = 0; i < vm2.stackSize; i++) {
                                vm.push(vm2.stack[i], vm2.isStackRaw(i));
                            }
                            // NOTE: does not acquire exitCode
                        }
                        break;
                    }
                }
            } else if (op == GatewayOP.DEBUG) {
                vm.dump(string(vm.readBytes(vm.readByte())));
            } else {
                revert InvalidRequest();
            }
            //console.log("op=%s gas=%s", op, g - gasleft());
        }
        return 0;
    }
}
