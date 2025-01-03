// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier} from '../AbstractVerifier.sol';
import {IVerifierHooks} from '../IVerifierHooks.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {RLPReader, RLPReaderExt} from '../RLPReaderExt.sol';
import {IRollupCore, Node} from './IRollupCore.sol';

contract NitroVerifier is AbstractVerifier {
    IRollupCore immutable _rollup;
    uint256 immutable _minBlocks;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IRollupCore rollup,
        uint256 minBlocks
    ) AbstractVerifier(urls, window, hooks) {
        _rollup = rollup;
        _minBlocks = minBlocks;
    }

    function getLatestContext() external view returns (bytes memory) {
        if (_minBlocks == 0) {
            return abi.encode(_rollup.latestConfirmed());
        }
        uint64 i = _rollup.latestNodeCreated();
        uint256 b = block.number - _minBlocks;
        while (true) {
            Node memory node = _rollup.getNode(i);
            if (node.createdAtBlock <= b && _isNodeUsable(node)) {
                return abi.encode(i);
            }
            if (i == 0) break;
            --i;
        }
        revert('Nitro: no node');
    }

    struct GatewayProof {
        uint64 nodeNum;
        bytes32 sendRoot;
        bytes rlpEncodedBlock;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view virtual returns (bytes[] memory, uint8 exitCode) {
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        Node memory node = _verifyNode(context, p.nodeNum);
        bytes32 stateRoot = _verifyStateRoot(
            node.confirmData,
            p.rlpEncodedBlock,
            p.sendRoot
        );
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, stateRoot, p.proofs, p.order, _hooks)
            );
    }

    function _isNodeUsable(Node memory node) internal pure returns (bool) {
        // http://web.archive.org/web/20240615020011/https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro
        // TODO: challengeHash check from F-10?
        return node.stakerCount > 0;
    }

    function _verifyNode(
        bytes memory context,
        uint64 nodeNum
    ) internal view returns (Node memory node) {
        uint64 nodeNum1 = abi.decode(context, (uint64));
        node = _rollup.getNode(nodeNum);
        if (nodeNum != nodeNum1) {
            Node memory node1 = _rollup.getNode(nodeNum1);
            _checkWindow(node1.createdAtBlock, node.createdAtBlock);
            if (_minBlocks == 0) {
                while (node1.prevNum > nodeNum) {
                    node1 = _rollup.getNode(node1.prevNum);
                }
                require(node1.prevNum == nodeNum, 'Nitro: not finalized');
            } else {
                require(_isNodeUsable(node1), 'Nitro: not usable');
            }
        }
    }

    function _verifyStateRoot(
        bytes32 confirmData,
        bytes memory rlpEncodedBlock,
        bytes32 sendRoot
    ) internal pure returns (bytes32) {
        bytes32 computed = keccak256(
            abi.encodePacked(keccak256(rlpEncodedBlock), sendRoot)
        );
        require(computed == confirmData, 'Nitro: confirmData');
        RLPReader.RLPItem[] memory v = RLPReader.readList(rlpEncodedBlock);
        return RLPReaderExt.strictBytes32FromRLP(v[3]);
    }
}
