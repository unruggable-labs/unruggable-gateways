import type { ProviderPair, HexString32 } from '../types.js';
import type { RPCEthGetBlock } from '../eth/types.js';
import { ZeroHash } from 'ethers/constants';
import { EventLog } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER, fetchBlockNumber } from '../utils.js';
import { encodeRlpBlock } from '../rlp.js';
import { CachedValue } from '../cached.js';
import {
  ArbitrumRollup,
  type ArbitrumConfig,
  type ArbitrumCommit,
} from './ArbitrumRollup.js';
import { RollupDeployment } from '../rollup.js';
import { CHAINS } from '../chains.js';

// https://docs.arbitrum.io/how-arbitrum-works/bold/gentle-introduction

// https://github.com/OffchainLabs/nitro-contracts/blob/main/src/rollup/AssertionState.sol
const ASSERTION_STATUS_CONFIRMED = 2n;

export type BoLDCommit = ArbitrumCommit & {
  readonly assertionHash: HexString32;
  readonly parentAssertionHash: HexString32;
};

const ROLLUP_ABI = new Interface([
  `function latestConfirmed() view returns (bytes32)`,
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

type ABIAssertionTuple = {
  createdAtBlock: bigint;
  status: bigint;
  configHash: HexString32;
};

// type ABIAssertionState = {
//   globalState: [
//     bytes32Vals: [blockHash: HexString32, sendRoot: HexString32],
//     u64Vals: [inboxPosition: bigint, positionInMessage: bigint],
//   ];
//   machineStatus: bigint;
//   endHistoryRoot: HexString32;
// };

export type BoLDConfig = ArbitrumConfig & { isBoLD: true };

export class BoLDRollup extends ArbitrumRollup<BoLDCommit> {
  static readonly arb1MainnetConfig: RollupDeployment<BoLDConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ARB1,
    Rollup: '0x4DCeB440657f21083db8aDd07665f8ddBe1DCfc0',
    isBoLD: true,
  };
  static readonly arb1SepoliaConfig: RollupDeployment<BoLDConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.ARB_SEPOLIA,
    Rollup: '0x042B2E6C5E99d4c521bd49beeD5E99651D9B0Cf4',
    isBoLD: true,
  };

  private readonly _genesis = new CachedValue(async () => {
    const [event] = await this.Rollup.queryFilter(
      this.Rollup.filters.AssertionCreated(null, ZeroHash)
    );
    if (!(event instanceof EventLog)) throw new Error('no genesis');
    return {
      blockNumber: BigInt(event.blockNumber),
      assertionHash: event.args.assertionHash,
    };
  }, Infinity);
  constructor(
    providers: ProviderPair,
    config: ArbitrumConfig,
    minAgeBlocks = 0
  ) {
    super(providers, true, config, ROLLUP_ABI, minAgeBlocks);
  }

  async fetchGenesisCommit() {
    return this.fetchCommit((await this._genesis.get()).blockNumber);
  }

  async fetchLatestAssertion(
    minAgeBlocks: number
  ): Promise<{ assertionHash: HexString32; blockNumber: bigint }> {
    if (!minAgeBlocks) {
      const assertionHash: HexString32 = await this.Rollup.latestConfirmed({
        blockTag: this.latestBlockTag,
      });
      const [event] = await this.Rollup.queryFilter(
        this.Rollup.filters.AssertionCreated(assertionHash)
      );
      if (!event) throw new Error(`expected assertion`);
      return {
        assertionHash,
        blockNumber: BigInt(event.blockNumber),
      };
    }
    const [{ blockNumber: block0 }, block1] = await Promise.all([
      this._genesis.get(),
      fetchBlockNumber(this.provider1, this.latestBlockTag),
    ]);
    const step = BigInt(this.getLogsStepSize);
    let block = block1 - BigInt(minAgeBlocks);
    while (block >= block0) {
      const prev = block - step;
      const events = await this.Rollup.queryFilter(
        this.Rollup.filters.AssertionCreated(),
        prev < block0 ? block0 : prev + 1n,
        block
      );
      if (events.length) {
        const event = events[events.length - 1] as EventLog;
        const assertionHash: HexString32 = event.args.assertionHash;
        return { blockNumber: BigInt(event.blockNumber), assertionHash };
      }
      block = prev;
    }
    throw new Error('assertion before genesis');
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return (await this.fetchLatestAssertion(this.minAgeBlocks)).blockNumber;
  }

  protected override async _fetchParentCommitIndex(
    commit: BoLDCommit
  ): Promise<bigint> {
    const tuple: ABIAssertionTuple = await this.Rollup.getAssertion(
      commit.parentAssertionHash
    );
    return tuple.status ? tuple.createdAtBlock : -1n;
  }

  protected override async _fetchCommit(index: bigint): Promise<BoLDCommit> {
    const [event] = await this.Rollup.queryFilter(
      this.Rollup.filters.AssertionCreated(),
      index,
      index
    );
    if (!(event instanceof EventLog)) throw new Error('no assertion');
    const assertionHash: HexString32 = event.args.assertionHash;
    const parentAssertionHash: HexString32 = event.args.parentAssertionHash;
    const blockHash: HexString32 =
      event.args.assertion.afterState.globalState[0][0]; // bytes32Vals[0]
    const [block, tuple] = await Promise.all([
      this.provider2.send('eth_getBlockByHash', [
        blockHash,
        false,
      ]) as Promise<RPCEthGetBlock | null>,
      this.unfinalized
        ? null
        : (this.Rollup.getAssertion(
            event.args.assertionHash
          ) as Promise<ABIAssertionTuple>),
    ]);
    if (!block) throw new Error(`no block: ${blockHash}`);
    if (tuple && tuple.status !== ASSERTION_STATUS_CONFIRMED) {
      throw new Error('not confirmed');
    }
    const encodedRollupProof = ABI_CODER.encode(
      [
        '(bytes32, bytes32, ((bytes32[2], uint64[2]), uint8, bytes32), bytes32, bytes)',
      ],
      [
        [
          assertionHash,
          parentAssertionHash,
          event.args.assertion.afterState,
          event.args.afterInboxBatchAcc,
          encodeRlpBlock(block),
        ],
      ]
    );
    const prover = new EthProver(this.provider2, block.number);
    return {
      index,
      prover,
      assertionHash,
      parentAssertionHash,
      encodedRollupProof,
    };
  }
}
