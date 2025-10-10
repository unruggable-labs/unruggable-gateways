// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IOptimismPortal } from './OPInterfaces.sol';

struct OPFaultParams {
    IOptimismPortal portal;
    uint256 minAgeSec;
    uint256[] allowedGameTypes;
    address[] allowedProposers;
}

struct FinalizationParams {
    uint256 finalityDelay;
    uint64 gameTypeUpdatedAt;
}