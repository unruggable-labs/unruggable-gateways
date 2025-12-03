// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';

// https://github.com/taikoxyz/taiko-mono/blob/6e5b8c800c0128ecf080567dc6daadd75c79319d/packages/protocol/contracts/layer1/based/ITaikoInbox.sol

struct TransitionState {
    bytes32 parentHash;
    bytes32 blockHash;
    bytes32 stateRoot;
    address prover;
    bool inProvingWindow;
    uint48 createdAt;
}

interface ITaiko {
    function getTransitionById(
        uint64 blockId,
        uint24 tid
    ) external view returns (TransitionState memory);
    function getLastSyncedTransition()
        external
        view
        returns (uint64 batchId, uint64 blockId, TransitionState memory ts);
}

contract TaikoVerifier is AbstractVerifier {
    ITaiko immutable _rollup;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        ITaiko rollup
    ) AbstractVerifier(urls, window, hooks) {
        _rollup = rollup;
    }

    function getLatestContext() external view returns (bytes memory) {
        (uint64 batchId, , TransitionState memory ts) = _rollup
            .getLastSyncedTransition();
        return abi.encode(batchId, ts.createdAt);
    }

    struct GatewayProof {
        uint64 batchId;
        uint24 tid;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        (, uint256 createdAt) = abi.decode(context, (uint64, uint48));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        TransitionState memory ts = _rollup.getTransitionById(p.batchId, p.tid); // reverts if invalid
        _checkWindow(createdAt, ts.createdAt);
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence({
                    index: 0,
                    stateRoot: ts.stateRoot,
                    proofs: p.proofs,
                    order: p.order,
                    hooks: _hooks
                })
            );
    }
}
