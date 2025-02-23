// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// extracted from:
// https://github.com/OffchainLabs/nitro-contracts/blob/94999b3e2d3b4b7f8e771cc458b9eb229620dd8f/src/rollup/Assertion.sol
// https://github.com/OffchainLabs/nitro-contracts/blob/94999b3e2d3b4b7f8e771cc458b9eb229620dd8f/src/state/GlobalState.sol
// https://github.com/OffchainLabs/nitro-contracts/blob/94999b3e2d3b4b7f8e771cc458b9eb229620dd8f/src/state/Machine.sol
// https://github.com/OffchainLabs/nitro-contracts/blob/94999b3e2d3b4b7f8e771cc458b9eb229620dd8f/src/rollup/AssertionState.sol
// https://github.com/OffchainLabs/nitro-contracts/blob/94999b3e2d3b4b7f8e771cc458b9eb229620dd8f/src/rollup/IRollupCore.sol

enum AssertionStatus {
    NoAssertion,
    Pending,
    Confirmed
}

struct AssertionNode {
    uint64 firstChildBlock;
    uint64 secondChildBlock;
    uint64 createdAtBlock;
    bool isFirstChild;
    AssertionStatus status;
    bytes32 configHash;
}

struct GlobalState {
    bytes32[2] bytes32Vals;
    uint64[2] u64Vals;
}

enum MachineStatus {
    RUNNING,
    FINISHED,
    ERRORED
}

struct AssertionState {
    GlobalState globalState;
    MachineStatus machineStatus;
    bytes32 endHistoryRoot;
}

interface IRollupCore_BoLD {
    function latestConfirmed() external view returns (bytes32);
    function getAssertion(bytes32) external view returns (AssertionNode memory);
    function confirmPeriodBlocks() external view returns (uint64);
    // function stakerCount() external view returns (uint256);
    // function getStakerAddress(uint64 i) external view returns (address);
    // function latestStakedAssertion(address) external view returns (bytes32);
}

// the data necessary to prove a stateRoot
struct RollupProof_BoLD {
    bytes32 assertionHash;
    bytes32 parentAssertionHash;
    AssertionState afterState;
    bytes32 inboxAcc;
    bytes rlpEncodedBlock;
}
