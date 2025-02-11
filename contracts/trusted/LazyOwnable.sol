// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// works like OpenZeppelin Ownable except
// it uses initialize() instead of constructor()

import {Ownable, Context} from '@openzeppelin/contracts/access/Ownable.sol';

error LazyOwnableAlreadyInitialized();

abstract contract LazyOwnable is Context {
    address private _owner;
    bool private _disowned;

    // constructor() {
    //     _disowned = true;
    // }

    function initialized() public view returns (bool) {
        return _disowned || _owner != address(0);
    }

    function initialize(address initialOwner) internal virtual {
        if (initialized()) {
            revert LazyOwnableAlreadyInitialized();
        }
        if (initialOwner == address(0)) {
            //revert Ownable.OwnableInvalidOwner(address(0));
            // the standard behavior is stupid
            // NOTE: this does not emit OwnershipTransferred()
            _disowned = true;
        } else {
            _transferOwnership(initialOwner);
        }
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (_disowned || owner() != _msgSender()) {
            revert Ownable.OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _disowned = true;
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert Ownable.OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit Ownable.OwnershipTransferred(oldOwner, newOwner);
    }
}
