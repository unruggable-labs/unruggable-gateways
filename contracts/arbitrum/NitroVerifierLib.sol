// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {RLPReader, RLPReaderExt} from '../RLPReaderExt.sol';

// extracted from:
// https://github.com/OffchainLabs/nitro-contracts/blob/v2.1.0/src/rollup/IRollupCore.sol
// https://github.com/OffchainLabs/nitro-contracts/blob/v2.1.0/src/rollup/Node.sol

struct Node {
    bytes32 stateHash;
    bytes32 challengeHash;
    bytes32 confirmData;
    uint64 prevNum;
    uint64 deadlineBlock;
    uint64 noChildConfirmedBeforeBlock;
    uint64 stakerCount;
    uint64 childStakerCount;
    uint64 firstChildBlock;
    uint64 latestChildNumber;
    uint64 createdAtBlock;
    bytes32 nodeHash;
}

interface IRollupCore {
    function latestConfirmed() external view returns (uint64);
    function latestNodeCreated() external view returns (uint64);
    function countStakedZombies(uint64 nodeNum) external view returns (uint256);
    function getNode(uint64 nodeNum) external view returns (Node memory);
}

library NitroVerifierLib {
    struct RollupProof {
        uint64 nodeNum;
        bytes32 sendRoot;
        bytes rlpEncodedBlock;
    }

    function latestIndex(
        address rollup,
        uint256 minAgeBlocks
    ) external view returns (uint64 index) {
        if (minAgeBlocks == 0) {
            index = IRollupCore(rollup).latestConfirmed();
        } else {
            index = IRollupCore(rollup).latestNodeCreated();
            uint256 b = block.number - minAgeBlocks;
            while (true) {
                Node memory node = IRollupCore(rollup).getNode(index);
                if (
                    node.createdAtBlock <= b &&
                    _isNodeUsable(IRollupCore(rollup), index, node)
                ) {
                    break;
                }
                if (index == 0) revert('Nitro: no node');
                --index;
            }
        }
    }

    function _isNodeUsable(
        IRollupCore rollup,
        uint64 index,
        Node memory node
    ) internal view returns (bool) {
        // http://web.archive.org/web/20240615020011/https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro
        // TODO: challengeHash check from F-10?
        return node.stakerCount > rollup.countStakedZombies(index);
    }

    function verifyRollup(
        address rollup,
        uint256 minAgeBlocks,
        bytes memory proof,
        uint64 nodeNum1
    ) external view returns (bytes32 stateRoot, uint64 latest, uint64 got) {
        RollupProof memory p = abi.decode(proof, (RollupProof));
        Node memory node = IRollupCore(rollup).getNode(p.nodeNum);
        got = node.createdAtBlock;
        if (p.nodeNum != nodeNum1) {
            Node memory node1 = IRollupCore(rollup).getNode(nodeNum1);
            latest = node1.createdAtBlock;
            if (minAgeBlocks == 0) {
                while (node1.prevNum > p.nodeNum) {
                    node1 = IRollupCore(rollup).getNode(node1.prevNum);
                }
                require(node1.prevNum == p.nodeNum, 'Nitro: not finalized');
            } else {
                require(
                    _isNodeUsable(IRollupCore(rollup), p.nodeNum, node),
                    'Nitro: not usable'
                );
            }
        } else {
            latest = node.createdAtBlock;
        }
        stateRoot = verifyStateRoot(p, node.confirmData);
    }

    function verifyStateRoot(
        RollupProof memory proof,
        bytes32 confirmData
    ) public pure returns (bytes32 stateRoot) {
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
        RLPReader.RLPItem[] memory v = RLPReader.readList(
            proof.rlpEncodedBlock
        );
        stateRoot = RLPReaderExt.strictBytes32FromRLP(v[3]);
    }
}
