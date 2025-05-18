// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';

// https://github.com/taikoxyz/taiko-mono/blob/6e5b8c800c0128ecf080567dc6daadd75c79319d/packages/protocol/contracts/layer1/based/ITaikoInbox.sol

struct TransitionState {
    bytes32 key;
    bytes32 blockHash;
    bytes32 stateRoot;
    address prover;
    uint96 validityBond;
    address contester;
    uint96 contestBond;
    uint64 timestamp;
    uint16 tier;
    uint8 __reserved1;
}

// struct TransitionState {
//     bytes32 parentHash;
//     bytes32 blockHash;
//     bytes32 stateRoot;
//     address prover;
//     bool inProvingWindow;
//     uint48 createdAt;
// }

interface ITaiko {
    function getTransition(
        uint64 blockId,
        bytes32 parentHash
    ) external view returns (TransitionState memory);
    function getLastSyncedTransition()
        external
        view
        returns (uint64 batchId, uint64 blockId, bytes32 stateRoot);
    // function getLastSyncedTransition()
    //     external
    //     view
    //     returns (uint64 batchId, uint64 blockId, TransitionState memory ts);
    // function getTransitionByParentHash(
    //     uint64 blockId,
    //     bytes32 parentHash
    // ) external view returns (TransitionState memory);
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
        // (uint64 batchId, , TransitionState memory ts) = _rollup.getLastSyncedTransition();
        // return abi.encode(batchId, ts.createdAt);
        (uint64 batchId, , ) = _rollup.getLastSyncedTransition();
        return abi.encode(batchId);
    }

    struct GatewayProof {
        uint64 batchId;
        bytes32 parentHash;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        // (uint64 batchId, uint256 t1) = abi.decode(context, (uint64));
        // GatewayProof memory p = abi.decode(proof, (GatewayProof));
        // TransitionState memory ts = _rollup.getTransition(
        //     p.batchId,
        //     p.parentHash
        // ); // reverts if invalid
        // _checkWindow(t1, ts.createdAt);
        uint64 batchId = abi.decode(context, (uint64));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        _checkWindow(batchId, p.batchId);
        TransitionState memory ts = _rollup.getTransition(
            p.batchId,
            p.parentHash
        ); // reverts if invalid
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, ts.stateRoot, p.proofs, p.order, _hooks)
            );
    }
}
