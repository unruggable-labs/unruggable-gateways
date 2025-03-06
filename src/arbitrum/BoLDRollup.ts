import type { ProviderPair, HexString32 } from '../types.js';
import type { RollupDeployment } from '../rollup.js';
import {
  AbstractArbitrumRollup,
  type ArbitrumConfig,
  type ArbitrumCommit,
} from './ArbitrumRollup.js';
import { CHAINS } from '../chains.js';
import { EventLog } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { keccak256 } from 'ethers/crypto';
import { concat } from 'ethers/utils';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER, fetchBlockFromHash, fetchBlockNumber } from '../utils.js';
import { encodeRlpBlock } from '../rlp.js';
import { CachedValue } from '../cached.js';

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

type ABIAssertionNode = {
  firstChildBlock: bigint;
  secondChildBlock: bigint;
  createdAtBlock: bigint;
  isFirstChild: boolean;
  status: bigint;
  configHash: HexString32;
};

type ABIAssertionState = {
  globalState: [
    bytes32Vals: [blockHash: HexString32, sendRoot: HexString32],
    u64Vals: [inboxPosition: bigint, positionInMessage: bigint],
  ];
  machineStatus: bigint;
  endHistoryRoot: HexString32;
};

type KnownAssertion = {
  readonly assertionHash: HexString32;
  readonly parentAssertionHash: HexString32;
  readonly afterState: ABIAssertionState;
  readonly afterInboxBatchAcc: HexString32;
  readonly createdAtBlock: bigint;
  confirmed: boolean;
  children: number; // only tracks unfinalized children
};

function knownFromCreatedEvent(event: EventLog): KnownAssertion {
  return {
    createdAtBlock: BigInt(event.blockNumber),
    assertionHash: event.args.assertionHash,
    parentAssertionHash: event.args.parentAssertionHash,
    afterState: event.args.assertion.afterState,
    afterInboxBatchAcc: event.args.afterInboxBatchAcc,
    confirmed: false,
    children: 0,
  };
}

function isValidAssertionChain(chain: KnownAssertion[]) {
  return (
    chain.length >= 2 &&
    chain[0].confirmed &&
    chain.slice(0, -1).every((x) => x.children < 2) &&
    chain[chain.length - 1].afterState.machineStatus == MACHINE_STATUS_FINISHED
  );
}

export type BoLDCommit = ArbitrumCommit & {
  readonly assertions: HexString32[]; // first is confirmed, last is the commit assertion
  readonly confirmed: boolean;
};

export class BoLDRollup extends AbstractArbitrumRollup<BoLDCommit> {
  // TODO: get docs link once arbitrum updates their website
  static readonly arb1MainnetConfig: RollupDeployment<ArbitrumConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ARB1,
    Rollup: '0x4DCeB440657f21083db8aDd07665f8ddBe1DCfc0',
    isBoLD: true,
  };
  static readonly arb1SepoliaConfig: RollupDeployment<ArbitrumConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.ARB1_SEPOLIA,
    Rollup: '0x042B2E6C5E99d4c521bd49beeD5E99651D9B0Cf4',
    isBoLD: true,
  };
  static readonly arbNovaMainnetConfig: RollupDeployment<ArbitrumConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ARB_NOVA,
    Rollup: '0xE7E8cCC7c381809BDC4b213CE44016300707B7Bd',
    isBoLD: true,
  };

  constructor(
    providers: ProviderPair,
    config: ArbitrumConfig,
    minAgeBlocks = 0
  ) {
    super(providers, true, config, ROLLUP_ABI, minAgeBlocks);
  }

  async _fetchNode(assertionHash: HexString32): Promise<ABIAssertionNode> {
    return this.Rollup.getAssertion(assertionHash);
  }

  private _lastBlock = -1n;
  readonly _assertionMap = new Map<HexString32, KnownAssertion>();
  readonly unfinalizedGuard = new CachedValue(async () => {
    const block1 = await fetchBlockNumber(this.provider1, this.latestBlockTag);
    let block0 = this._lastBlock + 1n;
    if (!block0) {
      const assertionHash: HexString32 = await this.Rollup.latestConfirmed({
        blockTag: block1,
      });
      const node = await this._fetchNode(assertionHash);
      if (!node.status) {
        throw new Error(`expected latest assertion: ${assertionHash}`);
      }
      block0 = node.createdAtBlock;
    }
    await this._syncAssertions(block0, block1);
    this._lastBlock = block1;
  }, 60000);
  private async _syncAssertions(block: bigint, block1: bigint) {
    const topics = [
      [
        this.Rollup.filters.AssertionCreated().fragment.topicHash,
        this.Rollup.filters.AssertionConfirmed().fragment.topicHash,
      ],
    ];
    // this is processed by increasing time (insertion order for Map)
    const inclusiveStep = BigInt(this.getLogsStepSize - 1);
    while (block <= block1) {
      let next = block + inclusiveStep;
      if (next > block1) next = block1;
      const events = await this.Rollup.queryFilter(topics, block, next);
      for (const e of events) {
        if (e instanceof EventLog) {
          if (e.eventName == 'AssertionCreated') {
            const known = knownFromCreatedEvent(e);
            const parent = this._assertionMap.get(known.parentAssertionHash);
            if (parent) parent.children++;
            this._assertionMap.set(known.assertionHash, known);
          } else {
            const known = this._assertionMap.get(e.args.assertionHash);
            if (known) {
              known.confirmed = true;
              // we only need to keep 1 confirmed assertion
              for (const key of this._assertionMap.keys()) {
                if (key == known.assertionHash) break;
                this._assertionMap.delete(key);
              }
            }
          }
        }
      }
      block = next + 1n;
    }
  }

  private _latestAssertions(fn: (index: bigint) => boolean) {
    return Array.from(this._assertionMap.values())
      .filter((x) => fn(x.createdAtBlock))
      .reverse(); // ordered by descending createdAtBlock
  }

  async _unfinalizedAssertionChain(assertionHash: HexString32) {
    await this.unfinalizedGuard.get();
    const chain: KnownAssertion[] = [];
    for (;;) {
      const known = this._assertionMap.get(assertionHash);
      if (!known) break; // broken chain
      chain.push(known);
      if (known.confirmed) break; // complete chain
      assertionHash = known.parentAssertionHash;
    }
    // returns sequence of assertions from oldest (confirmed?) to newest
    // NOTE: may not be a valid chain
    return chain.reverse();
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    if (this.minAgeBlocks) {
      await this.unfinalizedGuard.get();
      const block = this._lastBlock - BigInt(this.minAgeBlocks);
      for (const known of this._latestAssertions((x) => x <= block)) {
        const chain = await this._unfinalizedAssertionChain(
          known.assertionHash
        );
        if (isValidAssertionChain(chain)) {
          return known.createdAtBlock;
        }
      }
    }
    const assertionHash: HexString32 = await this.Rollup.latestConfirmed({
      blockTag: this.latestBlockTag,
    });
    const node = await this._fetchNode(assertionHash);
    if (!node.status) throw new Error(`expected latest assertion`);
    return node.createdAtBlock;
  }

  protected override async _fetchParentCommitIndex(
    commit: BoLDCommit
  ): Promise<bigint> {
    const node = await this._fetchNode(
      commit.assertions[commit.assertions.length - 2]
    );
    return node.status ? node.createdAtBlock : -1n;
  }

  async _findAssertionChainAtIndex(index: bigint) {
    if (this.minAgeBlocks) {
      await this.unfinalizedGuard.get();
      for (const known of this._latestAssertions((x) => x == index)) {
        const chain = await this._unfinalizedAssertionChain(
          known.assertionHash
        );
        if (isValidAssertionChain(chain)) return chain;
      }
    }
    const events = await this.Rollup.queryFilter(
      this.Rollup.filters.AssertionCreated(),
      index,
      index
    );
    // most likely there aren't 2+ assertions in 1 block...
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (
        event instanceof EventLog &&
        event.args.assertion.afterState.machineStatus == MACHINE_STATUS_FINISHED
      ) {
        const [node, [parentEvent]] = await Promise.all([
          this._fetchNode(event.args.assertionHash),
          this.Rollup.queryFilter(
            this.Rollup.filters.AssertionCreated(event.args.parentAssertionHash)
          ),
        ]);
        if (
          node.status == ASSERTION_STATUS_CONFIRMED &&
          parentEvent instanceof EventLog
        ) {
          const parent = knownFromCreatedEvent(parentEvent);
          parent.confirmed = true; // by construction
          const child = knownFromCreatedEvent(event);
          child.confirmed = true; // by status assertion
          // isValidAssertionChain() is true by construction
          // parent.children = 1; // not needed
          return [parent, child];
        }
      }
    }
    throw new Error('invalid assertion chain');
  }

  protected override async _fetchCommit(index: bigint): Promise<BoLDCommit> {
    const chain = await this._findAssertionChainAtIndex(index);
    const { afterState, confirmed } = chain[chain.length - 1];
    const blockHash = afterState.globalState[0][0];
    const block = await fetchBlockFromHash(this.provider2, blockHash);
    const encodedRollupProof = ABI_CODER.encode(
      ['(bytes32, bytes, ((bytes32[2], uint64[2]), uint8, bytes32), bytes)'],
      [
        [
          chain[0].assertionHash,
          encodeAssertionChain(chain.slice(1)),
          afterState,
          encodeRlpBlock(block),
        ],
      ]
    );
    return {
      index,
      prover: new EthProver(this.provider2, block.number),
      confirmed,
      assertions: chain.map((x) => x.assertionHash),
      encodedRollupProof,
    };
  }

  override async isCommitStillValid(commit: BoLDCommit): Promise<boolean> {
    if (commit.confirmed) return true;
    // one of the links may have been challenged
    const chain = await this._findAssertionChainAtIndex(commit.index);
    return chain.every((x, i) => commit.assertions[i] == x.assertionHash);
  }
}

function encodeAssertionChain(chain: KnownAssertion[]) {
  // starting from hash[0] (confirmed), we need to construct:
  // hash[n] = keccak(encode(hash[n-1], keccak256(abi.encode(p.afterState)), p.inboxAcc)
  return concat(
    chain.flatMap((known) => [
      keccak256(
        ABI_CODER.encode(
          ['((bytes32[2], uint64[2]), uint8, bytes32)'],
          [known.afterState]
        )
      ),
      known.afterInboxBatchAcc,
    ])
  );
}
