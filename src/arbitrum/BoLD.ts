import type { HexString32 } from '../types.js';
import { Interface } from 'ethers/abi';

// https://docs.arbitrum.io/how-arbitrum-works/bold/gentle-introduction
// https://github.com/OffchainLabs/bold

// https://github.com/OffchainLabs/nitro-contracts/blob/94999b3e2d3b4b7f8e771cc458b9eb229620dd8f/src/rollup/Assertion.sol
export const ASSERTION_STATUS_CONFIRMED = 2n;

// https://github.com/OffchainLabs/nitro-contracts/blob/94999b3e2d3b4b7f8e771cc458b9eb229620dd8f/src/state/Machine.sol
export const MACHINE_STATUS_FINISHED = 1n;

export const ROLLUP_ABI = new Interface([
  `function latestConfirmed() view returns (bytes32)`,
  `function confirmPeriodBlocks() view returns (uint256)`,
  `function getAssertion(bytes32) view returns ((
	uint64 firstChildBlock,
	uint64 secondChildBlock,
	uint64 createdAtBlock,
	bool isFirstChild,
	uint8 status,
	bytes32 configHash
  ))`,
  `event AssertionConfirmed(
	bytes32 indexed assertionHash,
	bytes32 blockHash,
	bytes32 sendRoot
  )`,
  `event AssertionCreated(
	bytes32 indexed assertionHash,
	bytes32 indexed parentAssertionHash,
	(
	  (
		bytes32 prevPrevAssertionHash,
		bytes32 sequencerBatchAcc,
		(
		  bytes32 wasmModuleRoot,
		  uint256 requiredStake,
		  address challengeManager,
		  uint64 confirmPeriodBlocks,
		  uint64 nextInboxPosition
		) configData
	  ) beforeStateData,
	  (
		(
		  bytes32[2] bytes32Vals,
		  uint64[2] u64Vals
		) globalState,
		uint8 machineStatus,
		bytes32 endHistoryRoot
	  ) beforeState,
	  (
		(
		  bytes32[2] bytes32Vals,
		  uint64[2] u64Vals
		) globalState,
		uint8 machineStatus,
		bytes32 endHistoryRoot
	  ) afterState
	) assertion,
	bytes32 afterInboxBatchAcc,
	uint256 inboxMaxCount,
	bytes32 wasmModuleRoot,
	uint256 requiredStake,
	address challengeManager,
	uint64 confirmPeriodBlocks
  )`,
]);

export type ABIAssertionNode = {
  firstChildBlock: bigint;
  secondChildBlock: bigint;
  createdAtBlock: bigint;
  isFirstChild: boolean;
  status: bigint;
  configHash: HexString32;
};

export type ABIAssertionState = {
  globalState: [
    bytes32Vals: [blockHash: HexString32, sendRoot: HexString32],
    u64Vals: [inboxPosition: bigint, positionInMessage: bigint],
  ];
  machineStatus: bigint;
  endHistoryRoot: HexString32;
};

export const ROLLUP_PROOF_TYPES = [
  '(bytes32, bytes, ((bytes32[2], uint64[2]), uint8, bytes32), bytes)',
];
