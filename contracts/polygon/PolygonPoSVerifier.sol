// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {RLPReader, RLPReaderExt} from '../RLPReaderExt.sol';

interface IRootChain {
    // https://github.com/0xPolygon/pos-contracts/blob/main/contracts/root/IRootChain.sol
    function currentHeaderBlock() external view returns (uint256);
    // https://github.com/0xPolygon/pos-contracts/blob/main/contracts/root/RootChainStorage.sol
    function headerBlocks(
        uint256
    )
        external
        view
        returns (
            bytes32 root,
            uint256 start,
            uint256 end,
            uint256 createdAt,
            address proposer
        );
}

contract PolygonPoSVerifier is AbstractVerifier {
    IRootChain immutable _rootChain;
    address immutable _poster;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IRootChain rootChain,
        address poster
    ) AbstractVerifier(urls, window, hooks) {
        _rootChain = rootChain;
        _poster = poster;
    }

    function getPoster() external view returns (address) {
        return _poster;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(_rootChain.currentHeaderBlock());
    }

    struct GatewayProof {
        bytes rlpEncodedProof;
        bytes rlpEncodedBlock;
        bytes[] proofs;
        bytes order;
    }

    // gas to prove stateRoot:
    // 20240828: ~100k gas
    // 20240829: ~275k gas (forgot receipt proof)
    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 headerBlock1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        RLPReader.RLPItem[] memory v = RLPReader.readList(p.rlpEncodedProof);
        uint256 headerBlock = uint256(RLPReaderExt.bytes32FromRLP(v[0]));
        (
            bytes32 rootHash,
            uint256 l2BlockNumberStart,
            ,
            uint256 createdAt,

        ) = _rootChain.headerBlocks(headerBlock);
        require(rootHash != bytes32(0), 'PolygonPoS: checkpoint');
        if (headerBlock1 != headerBlock) {
            (, , , uint256 createdAt1, ) = _rootChain.headerBlocks(
                headerBlock1
            );
            _checkWindow(createdAt1, createdAt);
        }
        bytes memory receipt = _proveReceiptInCheckpoint(
            v,
            rootHash,
            l2BlockNumberStart
        );
        bytes32 prevBlockHash = _extractPrevBlockHash(
            receipt,
            uint256(RLPReaderExt.bytes32FromRLP(v[9])) // logIndex
        );
        require(
            prevBlockHash == keccak256(p.rlpEncodedBlock),
            'PolygonPoS: blockHash'
        );
        v = RLPReader.readList(p.rlpEncodedBlock);
        bytes32 stateRoot = RLPReaderExt.strictBytes32FromRLP(v[3]);
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence({
                    index: 0,
                    stateRoot: stateRoot,
                    proofs: p.proofs,
                    order: p.order,
                    hooks: _hooks
                })
            );
    }

    function _extractPrevBlockHash(
        bytes memory receipt,
        uint256 logIndex
    ) internal view returns (bytes32) {
        if (uint8(receipt[0]) != 0) {
            // remove transaction type prefix
            assembly {
                mstore(add(receipt, 1), sub(mload(receipt), 1))
                receipt := add(receipt, 1)
            }
        }
        RLPReader.RLPItem[] memory v = RLPReader.readList(receipt); // receipt
        v = RLPReader.readList(v[3]); // logs
        require(v.length > logIndex, 'PolygonPoS: logIndex');
        v = RLPReader.readList(v[logIndex]); // log
        address poster = address(
            uint160(uint256(RLPReaderExt.bytes32FromRLP(v[0])))
        );
        require(poster == _poster, 'PolygonPoS: poster');
        v = RLPReader.readList(v[1]); // topics
        return RLPReaderExt.strictBytes32FromRLP(v[1]); // prevBlockHash
    }

    function _proveReceiptInCheckpoint(
        RLPReader.RLPItem[] memory v,
        bytes32 rootHash,
        uint256 l2BlockNumberStart
    ) internal pure returns (bytes memory receipt) {
        uint256 l2BlockNumber = uint256(RLPReaderExt.bytes32FromRLP(v[2]));
        bytes32 receiptsRoot = RLPReaderExt.strictBytes32FromRLP(v[5]);
        bytes32 leafHash = keccak256(
            abi.encode(
                l2BlockNumber,
                RLPReaderExt.bytes32FromRLP(v[3]), // timestamp
                RLPReaderExt.strictBytes32FromRLP(v[4]), // transactionRoot
                receiptsRoot
            )
        );
        bytes32 computedRootHash = _computeRootHash(
            leafHash,
            RLPReader.readBytes(v[1]),
            l2BlockNumber - l2BlockNumberStart
        );
        require(rootHash == computedRootHash, 'PolygonPoS: rootHash');
        receipt = RLPReader.readBytes(v[6]);
        require(
            keccak256(receipt) ==
                _computeReceiptHash(
                    receiptsRoot,
                    RLPReader.readList(RLPReader.readBytes(v[7])), // branches
                    RLPReader.readBytes(v[8]) // path using hp-encoding
                ),
            'PolygonPos: receiptsRoot'
        );
    }

    function _computeRootHash(
        bytes32 leafHash,
        bytes memory proof,
        uint256 index
    ) internal pure returns (bytes32 ret) {
        ret = leafHash;
        for (uint256 i; i < proof.length; index >>= 1) {
            bytes32 next;
            assembly {
                i := add(i, 32)
                next := mload(add(proof, i))
            }
            if (index & 1 == 0) {
                ret = keccak256(abi.encodePacked(ret, next));
            } else {
                ret = keccak256(abi.encodePacked(next, ret));
            }
        }
    }

    function _computeReceiptHash(
        bytes32 root,
        RLPReader.RLPItem[] memory parentNodes,
        bytes memory path
    ) internal pure returns (bytes32 ret) {
        path = _nibblesFromHexPrefixed(path);
        bytes32 nodeKey = root;
        uint256 pathPtr;
        for (
            uint256 i = 0;
            i < parentNodes.length && pathPtr <= path.length;
            i++
        ) {
            if (nodeKey != RLPReaderExt.keccak256FromRawRLP(parentNodes[i]))
                break;
            RLPReader.RLPItem[] memory v = RLPReader.readList(parentNodes[i]);
            if (v.length == 17) {
                // branch
                if (pathPtr == path.length) {
                    ret = keccak256(RLPReader.readBytes(v[16]));
                    break;
                }
                uint8 next = uint8(path[pathPtr]);
                if (next > 16) break;
                nodeKey = RLPReaderExt.strictBytes32FromRLP(v[next]);
                pathPtr += 1;
            } else if (v.length == 2) {
                // extension/leaf
                bytes memory frag = _nibblesFromHexPrefixed(
                    RLPReader.readBytes(v[0])
                );
                uint256 shared;
                while (
                    shared < frag.length &&
                    path[pathPtr + shared] == frag[shared]
                ) shared++;
                if (pathPtr + shared == path.length) {
                    ret = keccak256(RLPReader.readBytes(v[1]));
                    break;
                }
                if (shared == 0) break; // extension
                pathPtr += shared;
                nodeKey = RLPReaderExt.strictBytes32FromRLP(v[1]);
            } else {
                break;
            }
        }
    }

    // https://ethereum.org/en/developers/docs/data-structures-and-encoding/patricia-merkle-trie/#specification
    function _nibblesFromHexPrefixed(
        bytes memory v
    ) internal pure returns (bytes memory nibbles) {
        if (v.length != 0) {
            uint256 start = _nibbleAt(v, 0) & 1 == 0 ? 2 : 1;
            nibbles = new bytes((v.length << 1) - start);
            for (uint256 i; i < nibbles.length; i++) {
                nibbles[i] = bytes1(_nibbleAt(v, start + i));
            }
        }
    }
    function _nibbleAt(bytes memory v, uint256 i) private pure returns (uint8) {
        uint8 b = uint8(v[i >> 1]);
        return i & 1 == 0 ? b >> 4 : b & 15;
    }
}
