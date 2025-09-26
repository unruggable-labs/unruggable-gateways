// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GatewayFetchTarget, IGatewayVerifier, GatewayRequest} from './GatewayFetchTarget.sol';

contract GatewayFetchRelay is GatewayFetchTarget {
    function relay(
        IGatewayVerifier verifier,
        GatewayRequest memory req,
        string[] memory urls
    ) external view returns (bytes[] memory, uint8) {
        fetch(verifier, req, this.relayCallback.selector, '', urls);
    }

    function relayCallback(
        bytes[] memory values,
        uint8 exitCode,
        bytes calldata
    ) external pure returns (bytes[] memory, uint8) {
        return (values, exitCode);
    }
}
