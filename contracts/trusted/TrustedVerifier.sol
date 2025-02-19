// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LazyTrustedVerifier, IVerifierHooks} from './LazyTrustedVerifier.sol';

contract TrustedVerifier is LazyTrustedVerifier {
    constructor(
        IVerifierHooks hooks,
        string[] memory urls,
        address[] memory signers,
        uint256 expSec
    ) {
        initialize(msg.sender, hooks, urls, signers, expSec);
    }
}
