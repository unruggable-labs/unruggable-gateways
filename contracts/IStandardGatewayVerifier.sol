// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IGatewayVerifier} from './IGatewayVerifier.sol';
import {IVerifierHooks} from './IVerifierHooks.sol';

interface IStandardGatewayVerifier is IGatewayVerifier {
    function getHooks() external view returns (IVerifierHooks);
    function getWindow() external view returns (uint256);
}
