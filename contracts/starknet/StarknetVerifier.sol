// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {RLPReader, RLPReaderExt} from '../RLPReaderExt.sol';

interface IRollup {
    function stateRoot() external view returns (bytes32);
    function stateBlockNumber() external view returns (uint256);
}

// https://github.com/starkware-libs/cairo-lang/blob/master/src/starkware/starknet/solidity/Starknet.sol#L60
uint256 constant SLOT_STATE_ROOT = uint256(
    keccak256('STARKNET_1.0_INIT_STARKNET_STATE_STRUCT')
);

contract StarknetVerifier is AbstractVerifier {
    IRollup immutable _rollup;
    IVerifierHooks immutable _ethHooks;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IRollup rollup,
        IVerifierHooks ethHooks
    ) AbstractVerifier(urls, window, hooks) {
        _rollup = rollup;
        _ethHooks = ethHooks;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(_rollup.stateBlockNumber());
    }

    struct GatewayProof {
        uint256 blockNumber;
        bytes rlpEncodedL1Block;
        bytes accountProof;
        bytes storageProof;
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
        bytes32 stateRoot;
        if (blockNumber1 == p.blockNumber) {
            stateRoot = _rollup.stateRoot();
        } else {
            //_checkWindow(blockNumber1, p.blockNumber);
            RLPReader.RLPItem[] memory v = RLPReader.readList(
                p.rlpEncodedL1Block
            );
            bytes32 blockHash = blockhash(
                uint256(RLPReaderExt.bytes32FromRLP(v[8]))
            );
            require(
                blockHash == keccak256(p.rlpEncodedL1Block),
                'Starknet: blockhash'
            );
            stateRoot = RLPReaderExt.strictBytes32FromRLP(v[3]);
            bytes32 storageRoot = _ethHooks.verifyAccountState(
                stateRoot,
                address(_rollup),
                p.accountProof
            );
            stateRoot = _ethHooks.verifyStorageValue(
                storageRoot,
                address(_rollup),
                SLOT_STATE_ROOT,
                p.storageProof
            );
        }
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
}
