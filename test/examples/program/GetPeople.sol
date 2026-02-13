// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import '../../../contracts/GatewayFetchTarget.sol';
import '../../../contracts/GatewayFetcher.sol';
import '../../../contracts/GatewayRequest.sol';

/**
 * @title Program-based Gateway Request Example
 * @dev This example demonstrates a working program-based approach to gateway requests.
 */

contract GetPeople is GatewayFetchTarget {
    using GatewayFetcher for GatewayRequest;

    IGatewayVerifier immutable _verifier;
    address immutable _target;

    constructor(IGatewayVerifier verifier, address target) {
        _verifier = verifier;
        _target = target;
    }

    function getProgram(uint256 id) external view returns (string memory) {
        GatewayRequest memory req = GatewayFetcher.newRequest(1);
        req.setTarget(_target);
        req.push(id);
        
        // Program bytecode breakdown:
        // 0x00 = PUSH_0 (push 0 for slot)
        // 0x46 = SET_SLOT
        // 0x48 = FOLLOW
        // 0x3d = READ_BYTES (read name from slot 0)
        // 0x28 = PUSH_BYTES, 0x0104 = parameters (push 4-byte string)
        // 0x20697320 = " is " string
        // 0x5b = CONCAT (name + " is ")
        // 0x01 = PUSH_1 (push 1)
        // 0x47 = ADD_SLOT (slot becomes 1)
        // 0x3d = READ_BYTES (read age from slot 1)
        // 0x5b = CONCAT (name + " is " + age)
        // 0x00 = PUSH_0 (push 0 for output)
        // 0x33 = SET_OUTPUT
        bytes memory program = hex"0046483d280104206973205b0101473d5b0033";
        
        // Use evalLoop(0, 1) instead of eval() to pick up the `id` value from the stack
        req.push(program).evalLoop(0, 1);
        fetch(_verifier, req, this.getCallback.selector);
    }

    function getCallback(
        bytes[] memory values,
        uint8 /*exitCode*/,
        bytes memory /*carry*/
    ) external pure returns (string memory) {
        return string(values[0]);
    }
}
