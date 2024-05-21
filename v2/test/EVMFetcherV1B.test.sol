// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import "../contracts/EVMFetcherV1B.sol";

contract Test_EVMFetcherV1B is Test {

	using EVMFetcherV1B for EVMRequest;

	function test() external pure {
		EVMRequest memory r = EVMFetcher.create();
		r.setTarget(0x7C6EfCb602BC88794390A0d74c75ad2f1249A17f);
		r.setSlot(8).getBytes();
	}

}
	