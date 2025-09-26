// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract Backend {
    mapping(uint256 => string) values;

    function set(uint256 key, string memory value) external {
        values[key] = value;
    }
}
