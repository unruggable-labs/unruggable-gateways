import { Interface } from 'ethers/abi';

// https://github.com/OffchainLabs/nitro-contracts/blob/main/src/rollup/RollupCore.sol
export const ROLLUP_ABI = new Interface([
  `function latestConfirmed() view returns (uint64)`,
  `function latestNodeCreated() view returns (uint64)`,
  `function getNode(uint64 nodeNum) view returns ((
    bytes32 stateHash,
    bytes32 challengeHash,
    bytes32 confirmData,
    uint64 prevNum,
    uint64 deadlineBlock,
    uint64 noChildConfirmedBeforeBlock,
    uint64 stakerCount,
    uint64 childStakerCount,
    uint64 firstChildBlock,
    uint64 latestChildNumber,
    uint64 createdAtBlock,
    bytes32 nodeHash
  ))`,
  `event NodeCreated(
    uint64 indexed nodeNum,
    bytes32 indexed parentNodeHash,
    bytes32 indexed nodeHash,
    bytes32 executionHash,
    (
      ((bytes32[2] bytes32Vals, uint64[2] u64Vals) globalState, uint8 machineStatus) beforeState,
      ((bytes32[2] bytes32Vals, uint64[2] u64Vals) globalState, uint8 machineStatus) afterState,
      uint64 numBlocks
    ) assertion,
    bytes32 afterInboxBatchAcc,
    bytes32 wasmModuleRoot,
    uint256 inboxMaxCount
  )`,
  `event NodeConfirmed(
     uint64 indexed nodeNum,
     bytes32 blockHash,
     bytes32 sendRoot
  )`,
]);

export type ABINodeTuple = {
  readonly prevNum: bigint;
  readonly stakerCount: bigint;
  readonly createdAtBlock: bigint;
};
