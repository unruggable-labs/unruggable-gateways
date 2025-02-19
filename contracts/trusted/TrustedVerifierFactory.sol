// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {LazyTrustedVerifier, IVerifierHooks} from './LazyTrustedVerifier.sol';
import {Clones} from '@openzeppelin/contracts/proxy/Clones.sol';

event NewTrustedVerifier(address verifier);

contract TrustedVerifierFactory {
    LazyTrustedVerifier public immutable impl;

    constructor() {
        impl = new LazyTrustedVerifier();
    }

    function create(
        address owner,
        IVerifierHooks hooks,
        string[] calldata urls,
        address[] calldata signers,
        uint256 expSec
    ) external returns (LazyTrustedVerifier verifier) {
        verifier = impl.initialized() ? LazyTrustedVerifier(Clones.clone(address(impl))) : impl;
        verifier.init(owner, hooks, urls, signers, expSec);
        emit NewTrustedVerifier(address(verifier));
    }
}
