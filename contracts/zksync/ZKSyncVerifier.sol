// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';

interface IZKSyncDiamond {
    function storedBatchHash(
        uint256 batchNumber
    ) external view returns (bytes32);
    function l2LogsRootHash(
        uint256 batchNumber
    ) external view returns (bytes32);
    function getTotalBatchesExecuted() external view returns (uint256);
}

struct StoredBatchInfo {
    uint64 batchNumber;
    bytes32 batchHash;
    uint64 indexRepeatedStorageChanges;
    uint256 numberOfLayer1Txs;
    bytes32 priorityOperationsHash;
    bytes32 l2LogsTreeRoot;
    uint256 timestamp;
    bytes32 commitment;
}

contract ZKSyncVerifier is AbstractVerifier {
    IZKSyncDiamond immutable _diamond;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IZKSyncDiamond diamond
    ) AbstractVerifier(urls, window, hooks) {
        _diamond = diamond;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(_diamond.getTotalBatchesExecuted() - 1);
    }

    struct GatewayProof {
        bytes encodedBatch;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 batchIndex1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        StoredBatchInfo memory batchInfo = abi.decode(
            p.encodedBatch,
            (StoredBatchInfo)
        );
        _checkWindow(batchIndex1, batchInfo.batchNumber);
        require(
            keccak256(p.encodedBatch) ==
                _diamond.storedBatchHash(batchInfo.batchNumber),
            'ZKS: batchHash'
        );
        require(
            batchInfo.l2LogsTreeRoot ==
                _diamond.l2LogsRootHash(batchInfo.batchNumber),
            'ZKS: l2LogsRootHash'
        );
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence({
                    index: 0,
                    stateRoot: batchInfo.batchHash,
                    proofs: p.proofs,
                    order: p.order,
                    hooks: _hooks
                })
            );
    }
}
