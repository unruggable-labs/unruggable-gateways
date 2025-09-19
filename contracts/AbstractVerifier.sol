// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {ERC165} from '@openzeppelin/contracts/utils/introspection/ERC165.sol';

import {IStandardGatewayVerifier, IGatewayVerifier} from './IStandardGatewayVerifier.sol';
import {IVerifierHooks} from './IVerifierHooks.sol';

abstract contract AbstractVerifier is IStandardGatewayVerifier, Ownable, ERC165 {
    event GatewayURLsChanged();

    string[] _urls;
    uint256 immutable _window;
    IVerifierHooks immutable _hooks;

    constructor(
        string[] memory urls,
        uint256 window,
        IVerifierHooks hooks
    ) Ownable(msg.sender) {
        _urls = urls;
        _window = window;
        _hooks = hooks;
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override returns (bool) {
        return
            interfaceId == type(IGatewayVerifier).interfaceId ||
            interfaceId == type(IStandardGatewayVerifier).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function setGatewayURLs(string[] memory urls) external onlyOwner {
        _urls = urls;
        emit GatewayURLsChanged();
    }

    /// @inheritdoc IGatewayVerifier
    function gatewayURLs() external view returns (string[] memory) {
        return _urls;
    }

    /// @inheritdoc IStandardGatewayVerifier
    function getWindow() external view returns (uint256) {
        return _window;
    }

    /// @inheritdoc IStandardGatewayVerifier
    function getHooks() external view returns (IVerifierHooks) {
        return _hooks;
    }

    function _checkWindow(uint256 latest, uint256 got) internal view {
        if (got + _window < latest) revert CommitTooOld(latest, got, _window);
        if (got > latest) revert CommitTooNew(latest, got);
    }
}
