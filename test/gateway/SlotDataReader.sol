// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GatewayFetchTarget, IGatewayVerifier} from '../../contracts/GatewayFetchTarget.sol';
import {GatewayFetcher, GatewayRequest} from '../../contracts/GatewayFetcher.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

contract SlotDataReader is GatewayFetchTarget, Ownable {
    using GatewayFetcher for GatewayRequest;

    IGatewayVerifier public _verifier;
    address public _target;
    address public _pointer;
    string[] public _gateways;

    constructor(
        IGatewayVerifier verifier,
        address target,
        address pointer,
        string[] memory gateways
    ) Ownable(msg.sender) {
        _verifier = verifier;
        _target = target;
        _pointer = pointer;
        _gateways = gateways;
    }

    function debugCallback(
        bytes[] memory m,
        uint8 exitCode,
        bytes memory
    ) external pure returns (bytes[] memory, uint8) {
        return (m, exitCode);
    }
    function uint256Callback(
        bytes[] memory m,
        uint8,
        bytes memory
    ) external pure returns (uint256) {
        return abi.decode(m[0], (uint256));
    }
    function stringCallback(
        bytes[] memory m,
        uint8,
        bytes memory
    ) external pure returns (string memory) {
        return string(m[0]);
    }

    function readSlot(uint256 slot) public view returns (uint256) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(slot)
            .read()
            .setOutput(0);
        fetch(_verifier, r, this.uint256Callback.selector, '', _gateways);
    }
    function readLatest() external view returns (uint256) {
        return readSlot(0);
    }

    function readLatestViaPointer() external view returns (uint256) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_pointer)
            .setSlot(0)
            .read()
            .target()
            .setSlot(0)
            .read()
            .setOutput(0);
        fetch(_verifier, r, this.uint256Callback.selector, '', _gateways);
    }

    function readName() external view returns (string memory) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(1)
            .readBytes()
            .setOutput(0);
        fetch(_verifier, r, this.stringCallback.selector, '', _gateways);
    }

    function readHighscore(uint256 key) external view returns (uint256) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(2)
            .push(key)
            .follow()
            .read()
            .setOutput(0);
        fetch(_verifier, r, this.uint256Callback.selector, '', _gateways);
    }

    function readLatestHighscore() external view returns (uint256) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(0)
            .read()
            .setSlot(2)
            .follow()
            .read()
            .setOutput(0);
        fetch(_verifier, r, this.uint256Callback.selector, '', _gateways);
    }

    function readLatestHighscorer() external view returns (string memory) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(0)
            .read()
            .setSlot(3)
            .follow()
            .readBytes()
            .setOutput(0);
        fetch(_verifier, r, this.stringCallback.selector, '', _gateways);
    }

    function readRealName(
        string memory key
    ) external view returns (string memory) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(4)
            .push(key)
            .follow()
            .readBytes()
            .setOutput(0);
        fetch(_verifier, r, this.stringCallback.selector, '', _gateways);
    }

    function readLatestHighscorerRealName()
        external
        view
        returns (string memory)
    {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(0)
            .read()
            .setSlot(3)
            .follow()
            .readBytes()
            .setSlot(4)
            .follow()
            .readBytes()
            .setOutput(0);
        fetch(_verifier, r, this.stringCallback.selector, '', _gateways);
    }

    function readZero() external view returns (uint256) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(5)
            .read()
            .setOutput(0);
        fetch(_verifier, r, this.uint256Callback.selector, '', _gateways);
    }

    function readRootStr(
        string[] memory keys
    ) external view returns (string memory) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(12);
        for (uint256 i; i < keys.length; i++) {
            r.offset(2).push(keys[i]).follow();
        }
        r.offset(1).readBytes().setOutput(0);
        fetch(_verifier, r, this.stringCallback.selector, '', _gateways);
    }

    function readSlicedKeccak() external view returns (string memory) {
        GatewayRequest memory r = GatewayFetcher
            .newRequest(1)
            .setTarget(_target)
            .setSlot(0)
            .read()
            .setSlot(3)
            .follow()
            .readBytes()
            .setSlot(4)
            .follow()
            .readBytes()
            .slice(0, 3); // "Hal"
        r.setSlot(0).read().setSlot(2).follow().read().slice(16, 16); // uint128(12345)
        r.concat().keccak().setSlot(3).follow().readBytes().setOutput(0); // highscorers[keccak("Hal"+12345)]
        fetch(_verifier, r, this.stringCallback.selector, '', _gateways);
    }
}
