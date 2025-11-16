// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from './AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from './GatewayVM.sol';
import {RLPReader, RLPReaderExt} from './RLPReaderExt.sol';

contract SelfVerifier is AbstractVerifier {
    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks
    ) AbstractVerifier(urls, window, hooks) {}

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(block.number - 1);
    }

    struct GatewayProof {
        bytes rlpEncodedBlock;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 blockNumber1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        RLPReader.RLPItem[] memory v = RLPReader.readList(p.rlpEncodedBlock);
        uint256 blockNumber = uint256(RLPReaderExt.bytes32FromRLP(v[8]));
        _checkWindow(blockNumber1, blockNumber);
        // TODO: change this to https://eips.ethereum.org/EIPS/eip-2935
        bytes32 blockHash = blockhash(blockNumber);
        require(blockHash == keccak256(p.rlpEncodedBlock), 'Self: blockhash');
        bytes32 stateRoot = RLPReaderExt.strictBytes32FromRLP(v[3]);
        return verify(req, stateRoot, p.proofs, p.order);
    }

    function verify(
        GatewayRequest memory req,
        bytes32 stateRoot,
        bytes[] memory proofs,
        bytes memory order
    ) public view returns (bytes[] memory outputs, uint8 exitCode) {
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence({
                    index: 0,
                    stateRoot: stateRoot,
                    proofs: proofs,
                    order: order,
                    hooks: _hooks
                })
            );
    }
}
