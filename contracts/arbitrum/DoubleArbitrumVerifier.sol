// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ArbitrumVerifier} from './ArbitrumVerifier.sol';
import {IVerifierHooks} from '../IVerifierHooks.sol';
import {ArbitrumRollup, RollupProof_Nitro, RollupProof_BoLD} from './ArbitrumRollup.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';

contract DoubleArbitrumVerifier is ArbitrumVerifier {
    GatewayRequest _request;
    bool immutable _isBold23;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        address rollup12,
        uint256 minAgeBlocks12,
        GatewayRequest memory request,
        bool isBold23
    ) ArbitrumVerifier(urls, window, hooks, rollup12, minAgeBlocks12) {
        _request = request;
        _isBold23 = isBold23;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view override returns (bytes[] memory, uint8 exitCode) {
        GatewayProof[2] memory ps = abi.decode(proof, (GatewayProof[2]));
        bytes32 stateRoot = ArbitrumRollup.verifyStateRoot(
            _rollup,
            _minAgeBlocks,
            _window,
            ps[0].rollupProof,
            context
        );
        (bytes[] memory outputs, ) = GatewayVM.evalRequest(
            _request,
            ProofSequence(0, stateRoot, ps[0].proofs, ps[0].order, _hooks)
        );
        if (_isBold23) {
            // outputs[0] = blockhash
            RollupProof_BoLD memory p = abi.decode(
                ps[1].rollupProof,
                (RollupProof_BoLD)
            );
            stateRoot = ArbitrumRollup.extractStateRoot_BoLD(
                p,
                bytes32(outputs[0])
            );
        } else {
            // outputs[0] = node
            // outputs[1] = confirmData
            // outputs[2] = createdAtBlock (not used yet)
            RollupProof_Nitro memory p = abi.decode(
                ps[1].rollupProof,
                (RollupProof_Nitro)
            );
            stateRoot = ArbitrumRollup.extractStateRoot_Nitro(
                p,
                bytes32(outputs[1])
            );
        }
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, stateRoot, ps[1].proofs, ps[1].order, _hooks)
            );
    }
}
