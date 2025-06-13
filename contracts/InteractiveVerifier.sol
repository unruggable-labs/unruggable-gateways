// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from './AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from './GatewayVM.sol';

contract InteractiveVerifier is AbstractVerifier {
    event NewStateRoot(
        uint256 indexed prevIndex,
        uint256 indexed index,
        bytes32 stateRoot
    );

    struct Commit {
        bytes32 stateRoot;
        uint256 prevIndex;
    }

    mapping(uint256 => Commit) public commits;
    uint256 public latestIndex;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks
    ) AbstractVerifier(urls, window, hooks) {}

    function setStateRoot(uint256 index, bytes32 stateRoot) external onlyOwner {
        require(index > latestIndex, 'out of order');
        commits[index] = Commit(stateRoot, latestIndex);
        emit NewStateRoot(latestIndex, index, stateRoot);
        latestIndex = index;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(latestIndex);
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory values, uint8 exitCode) {
        uint256 index1 = abi.decode(context, (uint256));
        (uint256 index, bytes[] memory proofs, bytes memory order) = abi.decode(
            proof,
            (uint256, bytes[], bytes)
        );
        _checkWindow(index1, index);
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(
                    0,
                    commits[index].stateRoot,
                    proofs,
                    order,
                    _hooks
                )
            );
    }
}
