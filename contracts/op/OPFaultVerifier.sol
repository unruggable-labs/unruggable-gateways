// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AbstractVerifier, IVerifierHooks} from '../AbstractVerifier.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {Hashing, Types} from '../../lib/optimism/packages/contracts-bedrock/src/libraries/Hashing.sol';
import { IOptimismPortal, IOPFaultGameFinder, IDisputeGame, OPFaultParams } from './OPInterfaces.sol';



contract OPFaultVerifier is AbstractVerifier {
    IOptimismPortal immutable _portal;
    IOPFaultGameFinder immutable _gameFinder;
    OPFaultParams private _params;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks,
        IOPFaultGameFinder gameFinder,
        OPFaultParams memory params
    ) AbstractVerifier(urls, window, hooks) {
        _portal = params.portal;
        _gameFinder = gameFinder;
        _params = params;
    }

    function getLatestContext() external view virtual returns (bytes memory) {
        return
            abi.encode(
                _gameFinder.findGameIndex(
                    _params,
                    0
                )
            );
    }

    struct GatewayProof {
        uint256 gameIndex;
        Types.OutputRootProof outputRootProof;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 gameIndex1 = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        (, , IDisputeGame gameProxy, uint256 blockNumber,) = _gameFinder
            .gameAtIndex(_params, p.gameIndex);
        require(blockNumber != 0, 'OPFault: invalid game');
        if (p.gameIndex != gameIndex1) {
            (, , IDisputeGame gameProxy1) = _portal
                .disputeGameFactory()
                .gameAtIndex(gameIndex1);
            _checkWindow(_getGameTime(gameProxy1), _getGameTime(gameProxy));
        }
        require(
            gameProxy.rootClaim() ==
                Hashing.hashOutputRootProof(p.outputRootProof),
            'OPFault: rootClaim'
        );
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(
                    0,
                    p.outputRootProof.stateRoot,
                    p.proofs,
                    p.order,
                    _hooks
                )
            );
    }

    function _getGameTime(IDisputeGame g) internal view returns (uint256) {
        return
            _params.minAgeSec == 0 ? g.resolvedAt() : g.createdAt();
    }
}
