import type { ProviderPair, HexString32 } from '../types.js';
import type { RPCEthGetBlock } from '../eth/types.js';
import { ZeroHash } from 'ethers/constants';
import { EventLog } from 'ethers/contract';
import { Log } from 'ethers/providers';
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
// https://github.com/OffchainLabs/bold

// https://github.com/OffchainLabs/nitro-contracts/blob/94999b3e2d3b4b7f8e771cc458b9eb229620dd8f/src/rollup/Assertion.sol
const ASSERTION_STATUS_CONFIRMED = 2n;

// https://github.com/OffchainLabs/nitro-contracts/blob/94999b3e2d3b4b7f8e771cc458b9eb229620dd8f/src/state/Machine.sol
const MACHINE_STATUS_FINISHED = 1n;

export type BoLDCommit = ArbitrumCommit & {
  readonly assertionHash: HexString32;
  readonly parentAssertionHash: HexString32;
};

type ABIAssertionNode = {
  firstChildBlock: bigint;
  secondChildBlock: bigint;
  createdAtBlock: bigint;
  isFirstChild: boolean;
  status: bigint;
  configHash: HexString32;
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
  // `event AssertionConfirmed(
  //   bytes32 indexed assertionHash,
  //   bytes32 blockHash,
  //   bytes32 sendRoot
  // )`,
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
  static readonly arbNovaMainnetConfig: RollupDeployment<BoLDConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ARB_NOVA,
    Rollup: '0xE7E8cCC7c381809BDC4b213CE44016300707B7Bd',
    isBoLD: true,
  };

  readonly genesis = new CachedValue(async () => {
    // i think this is equivalent to genesisAssertionHash()
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

  async fetchLatestAssertion(block: bigint) {
    const block0 = (await this.genesis.get()).blockNumber;
    const step = BigInt(this.getLogsStepSize);
    while (block >= block0) {
      const prev = block - step;
      const found = await this._findUsableAssertion(
        await this.Rollup.queryFilter(
          this.Rollup.filters.AssertionCreated(),
          prev < block0 ? block0 : prev + 1n,
          block
        )
      );
      if (found) return found;
      block = prev;
    }
    throw new Error('assertion before genesis');
  }

  // search backwards, find the most recent that fits our criteria
  private async _findUsableAssertion(events: Log[]) {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (
        event instanceof EventLog &&
        event.args.assertion.afterState.machineStatus == MACHINE_STATUS_FINISHED
      ) {
        const node: ABIAssertionNode = await this.Rollup.getAssertion(
          event.args.assertionHash
        );
        if (!node.status) continue; // impossible?
        if (node.status !== ASSERTION_STATUS_CONFIRMED) {
          if (this.minAgeBlocks) {
            if (node.secondChildBlock) continue; // challenged
          } else {
            continue; // not confirmed
          }
        }
        return { event, node };
      }
    }
    return;
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    if (this.minAgeBlocks) {
      const block = await fetchBlockNumber(this.provider1, this.latestBlockTag);
      const { node } = await this.fetchLatestAssertion(
        block - BigInt(this.minAgeBlocks)
      );
      return node.createdAtBlock;
    } else {
      const assertionHash: HexString32 = await this.Rollup.latestConfirmed({
        blockTag: this.latestBlockTag,
      });
      const found = await this._findUsableAssertion(
        await this.Rollup.queryFilter(
          this.Rollup.filters.AssertionCreated(assertionHash)
        )
      );
      if (!found) throw new Error(`expected assertion`);
      return BigInt(found.node.createdAtBlock);
    }
  }

  protected override async _fetchParentCommitIndex(
    commit: BoLDCommit
  ): Promise<bigint> {
    if (this.minAgeBlocks) {
      const { node } = await this.fetchLatestAssertion(commit.index - 1n);
      return node.createdAtBlock;
    } else {
      const node: ABIAssertionNode = await this.Rollup.getAssertion(
        commit.parentAssertionHash
      );
      return node.status ? node.createdAtBlock : -1n;
    }
  }

  protected override async _fetchCommit(index: bigint): Promise<BoLDCommit> {
    const events = await this.Rollup.queryFilter(
      this.Rollup.filters.AssertionCreated(),
      index,
      index
    );
    if (!events.length) throw new Error('no assertion');
    const found = await this._findUsableAssertion(events);
    if (!found) throw new Error('unusable assertion');
    const assertionHash: HexString32 = found.event.args.assertionHash;
    const parentAssertionHash: HexString32 =
      found.event.args.parentAssertionHash;
    const blockHash: HexString32 =
      found.event.args.assertion.afterState.globalState[0][0]; // bytes32Vals[0]
    const block: RPCEthGetBlock | null = await this.provider2.send(
      'eth_getBlockByHash',
      [blockHash, false]
    );
    if (!block) throw new Error(`no block: ${blockHash}`);
    const encodedRollupProof = ABI_CODER.encode(
      [
        '(bytes32, bytes32, ((bytes32[2], uint64[2]), uint8, bytes32), bytes32, bytes)',
      ],
      [
        [
          assertionHash,
          parentAssertionHash,
          found.event.args.assertion.afterState,
          found.event.args.afterInboxBatchAcc,
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
