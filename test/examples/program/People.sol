// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract People {

    struct Record {
        string name;
        string age;
    }
    
    mapping(uint256 id => Record) records;

    constructor() {
        records[1] = Record("Alice", "25");
        records[2] = Record("Bob", "30");
        records[3] = Record("Christopher Alexander Johnson-Williams", "42");
    }
}
