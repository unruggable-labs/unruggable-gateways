// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {CommitTooOld, CommitTooNew} from '../IGatewayVerifier.sol';
import {RLPReader, RLPReaderExt} from '../RLPReaderExt.sol';
import {IRollupCore_v0, RollupProof_v0, Node} from './IRollupCore_v0.sol';
import {IRollupCore_BoLD, RollupProof_BoLD, AssertionNode, MachineStatus, ASSERTION_STATUS_CONFIRMED} from './IRollupCore_BoLD.sol';

import "forge-std/console2.sol";

library ArbitrumRollup {
    function isBoLD(address rollup) public view returns (bool) {
        (bool ok, bytes memory v) = rollup.staticcall(hex'353325e0'); // genesisAssertionHash()
        return ok && v.length == 32;
    }

    function getLatestContext(
        address rollup,
        uint256 minAgeBlocks
    ) external view returns (bytes memory) {
        return
            isBoLD(rollup)
                ? getLatestContext_BoLD(IRollupCore_BoLD(rollup), minAgeBlocks)
                : getLatestContext_v0(IRollupCore_v0(rollup), minAgeBlocks);
    }

    function getLatestContext_v0(
        IRollupCore_v0 rollup,
        uint256 minAgeBlocks
    ) public view returns (bytes memory) {
        uint64 i;
        if (minAgeBlocks == 0) {
            i = rollup.latestConfirmed();
        } else {
            i = rollup.latestNodeCreated();
            uint256 b = block.number - minAgeBlocks;
            while (true) {
                Node memory node = rollup.getNode(i);
                if (
                    node.createdAtBlock <= b && _isNodeUsable(rollup, i, node)
                ) {
                    break;
                }
                if (i == 0) revert('Nitro: no node');
                --i;
            }
        }
        return abi.encode(i, false);
    }
    function _isNodeUsable(
        IRollupCore_v0 rollup,
        uint64 index,
        Node memory node
    ) internal view returns (bool) {
        // http://web.archive.org/web/20240615020011/https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro
        // TODO: challengeHash check from F-10?
        return node.stakerCount > rollup.countStakedZombies(index);
    }

    function getLatestContext_BoLD(
        IRollupCore_BoLD rollup,
        uint256 minAgeBlocks
    ) public view returns (bytes memory) {
        uint256 b;
        if (minAgeBlocks == 0) {
            bytes32 assertionHash = rollup.latestConfirmed();
            AssertionNode memory node = rollup.getAssertion(assertionHash);
            b = node.createdAtBlock;
        } else {
            // uint256 n = rollup.stakerCount();
            // for (uint256 i; i < n; i++) {
            // 	address staker = rollup.getStakerAddress(i);
            // 	bytes32 assertionHash = rollup.latestStakedAssertion(staker);
            // 	AssertionNode memory node = rollup.getAssertion(assertionHash);
            // 	if (b < node.createdAtBlock) {
            // 		b = node.createdAtBlock;
            // 	}
            // }
            b = block.number - minAgeBlocks;
        }
        return abi.encode(b, true);
    }

    function verifyStateRoot(
        address rollup,
        uint256 minAgeBlocks,
        uint256 window,
        bytes memory proof,
        bytes memory context
    ) external view returns (bytes32 stateRoot) {
        (uint256 latest, bool BoLD) = abi.decode(context, (uint256, bool));
		uint256 got;
        if (BoLD) {
            (stateRoot, got) = _verifyStateRoot_BoLD(
                IRollupCore_BoLD(rollup),
                minAgeBlocks,
                proof
            );
        } else {
            (stateRoot, got, latest) = _verifyStateRoot_v0(
                IRollupCore_v0(rollup),
                minAgeBlocks,
                proof,
                uint64(latest)
            );
        }
        if (got + window < latest) revert CommitTooOld(latest, got, window);
        if (got > latest) revert CommitTooNew(latest, got);
    }

    function _verifyStateRoot_v0(
        IRollupCore_v0 rollup,
        uint256 minAgeBlocks,
        bytes memory proof,
        uint64 nodeNum1
    ) internal view returns (bytes32 stateRoot, uint64 got, uint64 latest) {
        RollupProof_v0 memory p = abi.decode(proof, (RollupProof_v0));
        Node memory node1 = rollup.getNode(nodeNum1);
        latest = node1.createdAtBlock;
        Node memory node = rollup.getNode(p.nodeNum);
        got = node.createdAtBlock;
        if (minAgeBlocks == 0) {
            while (node1.prevNum > p.nodeNum) {
                node1 = rollup.getNode(node1.prevNum);
            }
            require(node1.prevNum == p.nodeNum, 'Nitro: not finalized');
        } else {
            require(
                _isNodeUsable(rollup, p.nodeNum, node),
                'Nitro: not usable'
            );
        }
        stateRoot = extractStateRoot_v0(p, node.confirmData);
    }

    function _verifyStateRoot_BoLD(
        IRollupCore_BoLD rollup,
        uint256 minAgeBlocks,
        bytes memory proof
    ) internal view returns (bytes32 stateRoot, uint256 got) {
        RollupProof_BoLD memory p = abi.decode(proof, (RollupProof_BoLD));
        AssertionNode memory node = rollup.getAssertion(p.assertionHash);
        require(node.status != 0, 'BoLD: no node');
        bytes32 assertionHash = keccak256(
            abi.encodePacked(
                p.parentAssertionHash,
                keccak256(abi.encode(p.afterState)),
                p.inboxAcc
            )
        );
        require(assertionHash == p.assertionHash, 'BoLD: assertionHash');
        if (minAgeBlocks == 0) {
            require(
                node.status == ASSERTION_STATUS_CONFIRMED,
                'BoLD: not confirmed'
            );
        }
        got = node.createdAtBlock;
        require(
            p.afterState.machineStatus == MachineStatus.FINISHED,
            'BoLD: not finished'
        );
        stateRoot = extractStateRoot_BoLD(
            p,
            p.afterState.globalState.bytes32Vals[0]
        );
    }

    function extractStateRoot_v0(
        RollupProof_v0 memory proof,
        bytes32 confirmData
    ) public pure returns (bytes32) {
        require(
            confirmData ==
                keccak256(
                    abi.encodePacked(
                        keccak256(proof.rlpEncodedBlock),
                        proof.sendRoot
                    )
                ),
            'Nitro: confirmData'
        );
        return _extractStateRoot(proof.rlpEncodedBlock);
    }

    function extractStateRoot_BoLD(
        RollupProof_BoLD memory proof,
        bytes32 blockHash
    ) public pure returns (bytes32) {
        require(
            keccak256(proof.rlpEncodedBlock) == blockHash,
            'BoLD: blockhash'
        );
        return _extractStateRoot(proof.rlpEncodedBlock);
    }

    function _extractStateRoot(
        bytes memory rlpEncodedBlock
    ) internal pure returns (bytes32) {
        RLPReader.RLPItem[] memory v = RLPReader.readList(rlpEncodedBlock);
        return RLPReaderExt.strictBytes32FromRLP(v[3]);
    }
}
