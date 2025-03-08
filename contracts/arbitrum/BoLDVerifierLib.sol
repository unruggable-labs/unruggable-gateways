// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {RLPReader, RLPReaderExt} from '../RLPReaderExt.sol';

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

interface IRollupCore {
    function latestConfirmed() external view returns (bytes32);
    function getAssertion(bytes32) external view returns (AssertionNode memory);
    function confirmPeriodBlocks() external view returns (uint64);
    // function stakerCount() external view returns (uint256);
    // function getStakerAddress(uint64 i) external view returns (address);
    // function latestStakedAssertion(address) external view returns (bytes32);
}

library BoLDVerifierLib {
    struct RollupProof {
        bytes32 assertionHash;
        bytes encodedAssertionChain;
        AssertionState afterState;
        bytes rlpEncodedBlock;
    }

    function latestIndex(
        address rollup,
        uint256 minAgeBlocks
    ) external view returns (uint256 index) {
        if (minAgeBlocks == 0) {
            bytes32 assertionHash = IRollupCore(rollup).latestConfirmed();
            AssertionNode memory node = IRollupCore(rollup).getAssertion(
                assertionHash
            );
            index = node.createdAtBlock;
        } else {
            index = block.number - minAgeBlocks;
        }
    }

    function verifyRollup(
        address rollup,
        uint256 minAgeBlocks,
        bytes memory proof
    ) external view returns (bytes32 stateRoot, uint256 got) {
        RollupProof memory p = abi.decode(proof, (RollupProof));
        (
            AssertionNode memory node,
            bytes32 afterStateHash
        ) = _verifyAssertionChain(
                IRollupCore(rollup),
                p.encodedAssertionChain,
                p.assertionHash,
                minAgeBlocks == 0
            );
        require(
            keccak256(abi.encode(p.afterState)) == afterStateHash,
            'BoLD: after state'
        );
        require(
            p.afterState.machineStatus == MachineStatus.FINISHED,
            'BoLD: not finished'
        );
        got = node.createdAtBlock;
        stateRoot = verifyStateRoot(p, p.afterState.globalState.bytes32Vals[0]);
    }

    function _verifyAssertionChain(
        IRollupCore rollup,
        bytes memory v,
        bytes32 assertionHash,
        bool finalized
    )
        internal
        view
        returns (AssertionNode memory node, bytes32 afterStateHash)
    {
        node = rollup.getAssertion(assertionHash);
        require(
            node.status == AssertionStatus.Confirmed,
            'BoLD: parent unfinalized'
        );
        require(v.length > 0 && v.length & 63 == 0, 'BoLD: bad chain');
        for (uint256 i; i < v.length; ) {
            bytes32 inboxAcc;
            assembly {
                i := add(i, 32)
                afterStateHash := mload(add(v, i))
                i := add(i, 32)
                inboxAcc := mload(add(v, i))
            }
            assertionHash = keccak256(
                abi.encodePacked(assertionHash, afterStateHash, inboxAcc)
            );
            bool parentUnchallenged = node.secondChildBlock == 0;
            node = rollup.getAssertion(assertionHash);
            if (node.status != AssertionStatus.Confirmed) {
                require(!finalized, 'BoLD: unfinalized');
                require(parentUnchallenged, 'BoLD: challenged');
                require(
                    node.status == AssertionStatus.Pending,
                    'BoLD: no assertion'
                );
            }
        }
    }

    function verifyStateRoot(
        RollupProof memory proof,
        bytes32 blockHash
    ) public pure returns (bytes32 stateRoot) {
        require(
            keccak256(proof.rlpEncodedBlock) == blockHash,
            'BoLD: blockHash'
        );
        RLPReader.RLPItem[] memory v = RLPReader.readList(
            proof.rlpEncodedBlock
        );
        stateRoot = RLPReaderExt.strictBytes32FromRLP(v[3]);
    }
}
