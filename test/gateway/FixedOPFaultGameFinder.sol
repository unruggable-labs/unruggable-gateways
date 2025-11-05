// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OPFaultGameFinder, OPFaultParams} from "../../contracts/op/OPFaultGameFinder.sol";

contract FixedOPFaultGameFinder is OPFaultGameFinder {
    uint256 immutable _gameIndex;

    constructor(uint256 gameIndex) {
        _gameIndex = gameIndex;
    }

    function findGameIndex(OPFaultParams memory, uint256) external view override returns (uint256) {
        return _gameIndex;
    }
}
