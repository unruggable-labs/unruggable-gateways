// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IGatewayVerifier} from '../IGatewayVerifier.sol';
import {IVerifierHooks} from '../IVerifierHooks.sol';
import {GatewayRequest, GatewayVM, ProofSequence} from '../GatewayVM.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {LazyOwnable} from './LazyOwnable.sol';

event TrustedVerifierChanged();

contract LazyTrustedVerifier is LazyOwnable, IGatewayVerifier {

    IVerifierHooks _hooks;
    mapping(address => bool) _signers;
    uint256 _expSec;
    string[] _urls;

    function init(
        address _owner,
        IVerifierHooks hooks,
        string[] memory urls,
        address[] memory signers,
        uint256 expSec
    ) external {
        initialize(_owner, hooks, urls, signers, expSec);
    }

    function initialize(
        address _owner,
        IVerifierHooks hooks,
        string[] memory urls,
        address[] memory signers,
        uint256 expSec
    ) internal {
        super.initialize(_owner);
        _hooks = hooks;
        _urls = urls;
        for (uint256 i; i < signers.length; i++) {
            _signers[signers[i]] = true;
        }
        _expSec = expSec;
    }

    function getExpSec() external view returns (uint256) {
        return _expSec;
    }

    function getHooks() external view returns (IVerifierHooks) {
        return _hooks;
    }

    function isSigner(address signer) external view returns (bool) {
        return _signers[signer];
    }

    function setGatewayURLs(string[] memory urls) external onlyOwner {
        _urls = urls;
        emit TrustedVerifierChanged();
    }

    function setHooks(IVerifierHooks hooks) external onlyOwner {
        _hooks = hooks;
        emit TrustedVerifierChanged();
    }

    function setExpSec(uint256 expSec) external onlyOwner {
        _expSec = expSec;
        emit TrustedVerifierChanged();
    }

    function setSigner(address signer, bool allow) external onlyOwner {
        _signers[signer] = allow;
        emit TrustedVerifierChanged();
    }

    function gatewayURLs() external view returns (string[] memory) {
        return _urls;
    }

    function getLatestContext() external view returns (bytes memory) {
        return abi.encode(block.timestamp);
    }

    struct GatewayProof {
        bytes signature;
        uint64 signedAt;
        bytes32 stateRoot;
        bytes[] proofs;
        bytes order;
    }

    function getStorageValues(
        bytes memory context,
        GatewayRequest memory req,
        bytes memory proof
    ) external view returns (bytes[] memory, uint8 exitCode) {
        uint256 t = abi.decode(context, (uint256));
        GatewayProof memory p = abi.decode(proof, (GatewayProof));
        bytes32 hash = keccak256(
            // https://github.com/ethereum/eips/issues/191
            abi.encodePacked(
                hex'1900', // magic + version(0)
                address(0), // unbound
                p.signedAt,
                p.stateRoot
            )
        );
        address signer = ECDSA.recover(hash, p.signature);
        require(_signers[signer], 'Trusted: signer');
        uint256 dt = p.signedAt > t ? p.signedAt - t : t - p.signedAt;
        require(dt <= _expSec, 'Trusted: expired');
        return
            GatewayVM.evalRequest(
                req,
                ProofSequence(0, p.stateRoot, p.proofs, p.order, _hooks)
            );
    }
}
