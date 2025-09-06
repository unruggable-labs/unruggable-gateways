// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {GatewayRequest} from './GatewayRequest.sol';
import {IGatewayVerifier} from './IGatewayVerifier.sol';
import {IGatewayProtocol} from './IGatewayProtocol.sol';

error OffchainLookup(
    address from,
    string[] urls,
    bytes request,
    bytes4 callback,
    bytes carry
);

abstract contract GatewayFetchTarget {
    error TooManyProofs(uint256 max);
    error OutOfGas();

    struct Session {
        IGatewayVerifier verifier;
        bytes context;
        GatewayRequest req;
        bytes4 callback;
        bytes carry;
    }

    function fetch(
        IGatewayVerifier verifier,
        GatewayRequest memory req,
        bytes4 callback
    ) internal view {
        fetch(verifier, req, callback, '', new string[](0));
    }

    function fetch(
        IGatewayVerifier verifier,
        GatewayRequest memory req,
        bytes4 callback,
        bytes memory carry,
        string[] memory urls
    ) internal view {
        bytes memory context = verifier.getLatestContext();
        if (urls.length == 0) urls = verifier.gatewayURLs();
        revert OffchainLookup(
            address(this),
            urls,
            abi.encodeCall(IGatewayProtocol.proveRequest, (context, req)),
            this.fetchCallback.selector,
            abi.encode(Session(verifier, context, req, callback, carry))
        );
    }

    function fetchCallback(
        bytes calldata response,
        bytes calldata carry
    ) external view {
        if ((response.length & 31) != 0) {
            bytes memory v = response;
            assembly {
                revert(add(v, 32), mload(v)) // propagate CallbackError
            }
        }
        Session memory ses = abi.decode(carry, (Session));
        // bool ok;
        // bytes memory ret;
        // uint256 g = gasleft();
        // try
        //     ses.verifier.getStorageValues(ses.context, ses.req, response)
        // returns (bytes[] memory values, uint8 exitCode) {
        //     (ok, ret) = address(this).staticcall(
        //         abi.encodeWithSelector(
        //             ses.callback,
        //             values,
        //             exitCode,
        //             ses.carry
        //         )
        //     );
        // } catch (bytes memory err) {
        //     if (err.length == 0 && gasleft() < (g * 3) >> 6) { // 1/64 + 1/32 ???
        //         ret = abi.encodeWithSelector(OutOfGas.selector);
        //     } else {
        //         ret = err;
        //     }
        // }
        (bytes[] memory values, uint8 exitCode) = ses.verifier.getStorageValues(
            ses.context,
            ses.req,
            response
        );
        (bool ok, bytes memory ret) = address(this).staticcall(
            abi.encodeWithSelector(ses.callback, values, exitCode, ses.carry)
        );
        if (ok) {
            assembly {
                return(add(ret, 32), mload(ret))
            }
        } else {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }
}
