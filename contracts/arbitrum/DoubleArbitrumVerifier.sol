// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ArbitrumVerifier, IVerifierHooks} from './ArbitrumVerifier.sol';
import {NitroVerifierLib} from './NitroVerifierLib.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';

contract DoubleArbitrumVerifier is ArbitrumVerifier {
    GatewayRequest public request;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        address rollup12,
        uint256 minAgeBlocks12,
        bool isBoLD12,
        GatewayRequest memory _request
    )
        ArbitrumVerifier(
            urls,
            window,
            hooks,
            rollup12,
            minAgeBlocks12,
            isBoLD12
        )
    {
        request = _request;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view override returns (bytes[] memory, uint8 exitCode) {
        GatewayProof[2] memory ps = abi.decode(proof, (GatewayProof[2]));
        bytes32 stateRoot = _verifyRollup(ps[0], context);
        (bytes[] memory outputs, ) = GatewayVM.evalRequest(
            request,
            ProofSequence({
                index: 0,
                stateRoot: stateRoot,
                proofs: ps[0].proofs,
                order: ps[0].order,
                hooks: _hooks
            })
        );
        // outputs[0] = node
        // outputs[1] = confirmData
        // outputs[2] = createdAtBlock (not used yet)
        NitroVerifierLib.RollupProof memory p = abi.decode(
            ps[1].rollupProof,
            (NitroVerifierLib.RollupProof)
        );
        stateRoot = NitroVerifierLib.verifyStateRoot(p, bytes32(outputs[1]));
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence({
                    index: 0,
                    stateRoot: stateRoot,
                    proofs: ps[1].proofs,
                    order: ps[1].order,
                    hooks: _hooks
                })
            );
    }
}
