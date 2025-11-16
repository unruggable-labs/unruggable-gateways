// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAnchorStateRegistry} from './OPInterfaces.sol';

struct OPFaultParams {
    IAnchorStateRegistry asr;
    uint256 minAgeSec;
    uint256[] allowedGameTypes;
    address[] allowedProposers;
}
