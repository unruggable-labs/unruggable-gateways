import type { ProviderPair, HexString32 } from '../types.js';
import type { RollupDeployment } from '../rollup.js';
import {
  AbstractArbitrumRollup,
  type ArbitrumConfig,
  type ArbitrumCommit,
} from './ArbitrumRollup.js';
import { Log } from 'ethers/providers';
import { EventLog } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { keccak256 } from 'ethers/crypto';
import { concat } from 'ethers/utils';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER, fetchBlockFromHash, fetchBlockNumber } from '../utils.js';
import { encodeRlpBlock } from '../rlp.js';
import { CHAINS } from '../chains.js';
import { CachedMap, CachedValue } from '../cached.js';

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
};

function isValidCreatedEvent(event: Log): event is EventLog {
  return (
    event instanceof EventLog &&
    event.args.assertion.afterState.machineStatus == MACHINE_STATUS_FINISHED
  );
}

function knownAssertionFromCreatedEvent(
  event: EventLog,
  confirmed = false
): KnownAssertion {
  return {
    createdAtBlock: BigInt(event.blockNumber),
    assertionHash: event.args.assertionHash,
    parentAssertionHash: event.args.parentAssertionHash,
    afterState: event.args.assertion.afterState,
    afterInboxBatchAcc: event.args.afterInboxBatchAcc,
    confirmed,
  };
}

export type BoLDCommit = ArbitrumCommit & {
  readonly assertions: HexString32[];
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

  async _getAssertion(assertionHash: HexString32): Promise<ABIAssertionNode> {
    return this.Rollup.getAssertion(assertionHash);
  }

  maxAssertions = 1000; // only applies to unfinalized

  private _lastSync = -1n;
  readonly _assertionMap = new Map<HexString32, KnownAssertion>();
  readonly _assertionCache = new CachedMap<HexString32, ABIAssertionNode>(30);
  private readonly _syncGuard = new CachedValue(async () => {
    const block1 = await fetchBlockNumber(this.provider1, this.latestBlockTag);
    let block0 = this._lastSync + 1n;
    if (!block0) {
      const assertionHash: HexString32 = await this.Rollup.latestConfirmed({
        blockTag: block1,
      });
      const [event] = await this.Rollup.queryFilter(
        this.Rollup.filters.AssertionCreated(assertionHash)
      );
      if (!event) {
        throw new Error(`expected latest assertion: ${assertionHash}`);
      }
      block0 = BigInt(event.blockNumber);
    }
    await this._syncAssertions(block0, block1);
    this._lastSync = block1;
  }, 60000);
  private async _syncAssertions(block: bigint, block1: bigint) {
    const topics = [
      [
        this.Rollup.filters.AssertionCreated().fragment.topicHash,
        this.Rollup.filters.AssertionConfirmed().fragment.topicHash,
      ],
    ];
    // note: this is processed by increasing time
    const inclusiveStep = BigInt(this.getLogsStepSize - 1);
    while (block <= block1) {
      let next = block + inclusiveStep;
      if (next > block1) next = block1;
      const events = await this.Rollup.queryFilter(topics, block, next);
      for (const e of events) {
        if (e instanceof EventLog) {
          if (e.eventName == 'AssertionCreated') {
            if (isValidCreatedEvent(e)) {
              const known = knownAssertionFromCreatedEvent(e);
              this._assertionMap.set(known.assertionHash, known);
            }
          } else {
            const known = this._assertionMap.get(e.args.assertionHash);
            if (known) known.confirmed = true;
          }
        }
      }
      block = next + 1n;
    }
    // NOTE: maxAssertions must be large enough to retain 2 confirmed assertions in the cache
    const iter = this._assertionMap.keys();
    while (this._assertionMap.size > this.maxAssertions) {
      this._assertionMap.delete(iter.next().value!);
    }
  }

  private _latestAssertions(fn: (index: bigint) => boolean) {
    // Map uses insertion order, which follows createdAtBlock
    return Array.from(this._assertionMap.values())
      .filter((x) => fn(x.createdAtBlock))
      .reverse();
  }

  async _isValidAssertionChain(chain: KnownAssertion[] | undefined) {
    if (chain && chain.length >= 2 && chain[0].confirmed) {
      const nodes = await Promise.all(
        chain
          .slice(1, -1)
          .map((x) =>
            this._assertionCache.get(x.assertionHash, (xx) =>
              this._getAssertion(xx)
            )
          )
      );
      // all unconfirmed inner assertions must be unchallenged
      if (nodes.every((x) => !x.secondChildBlock)) {
        return true;
      }
    }
    return false;
  }

  private async _assembleUnfinalizedAssertionChain(assertionHash: HexString32) {
    await this._syncGuard.get();
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
      await this._syncGuard.get();
      const block = this._lastSync - BigInt(this.minAgeBlocks);
      for (const known of this._latestAssertions((x) => x <= block)) {
        const chain = await this._assembleUnfinalizedAssertionChain(
          known.assertionHash
        );
        if (await this._isValidAssertionChain(chain)) {
          return known.createdAtBlock;
        }
      }
    }
    const assertionHash: HexString32 = await this.Rollup.latestConfirmed({
      blockTag: this.latestBlockTag,
    });
    const node = await this._getAssertion(assertionHash);
    if (node.status == ASSERTION_STATUS_CONFIRMED) {
      return node.createdAtBlock;
    }
    throw new Error(`expected latest assertion`);
  }

  protected override async _fetchParentCommitIndex(
    commit: BoLDCommit
  ): Promise<bigint> {
    // if (this.minAgeBlocks) {
    //   return this._findLatestUnfinalizedAssertion(commit.index - 1n);
    // } else {
    const node: ABIAssertionNode = await this.Rollup.getAssertion(
      commit.assertions[commit.assertions.length - 2]
    );
    return node.status ? node.createdAtBlock : -1n;
  }

  async _findAssertionChainAtIndex(index: bigint) {
    if (this.minAgeBlocks) {
      await this._syncGuard.get();
      for (const known of this._latestAssertions((x) => x == index)) {
        const chain = await this._assembleUnfinalizedAssertionChain(
          known.assertionHash
        );
        if (await this._isValidAssertionChain(chain)) return chain;
      }
    }
    const events = await this.Rollup.queryFilter(
      this.Rollup.filters.AssertionCreated(),
      index,
      index
    );
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (isValidCreatedEvent(event)) {
        const [node, [parentEvent]] = await Promise.all([
          this._getAssertion(event.args.assertionHash),
          this.Rollup.queryFilter(
            this.Rollup.filters.AssertionCreated(event.args.parentAssertionHash)
          ),
        ]);
        if (
          node.status == ASSERTION_STATUS_CONFIRMED &&
          parentEvent instanceof EventLog
        ) {
          return [
            knownAssertionFromCreatedEvent(parentEvent, true),
            knownAssertionFromCreatedEvent(event, true),
          ];
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
    if (this.minAgeBlocks) {
      // one of the links may have been challenged
      const chain = await this._findAssertionChainAtIndex(commit.index);
      return (
        chain && chain.every((x, i) => commit.assertions[i] == x.assertionHash)
      );
    } else {
      return true;
    }
  }
}

function encodeAssertionChain(chain: KnownAssertion[]) {
  // starting from hash[0] (confirmed), we need to construct:
  // hash[n] = keccak(encode(hash[n-1], keccak256(abi.encode(p.afterState)), p.inboxAcc)
  const v = [];
  for (const known of chain) {
    v.push(
      keccak256(
        ABI_CODER.encode(
          ['((bytes32[2], uint64[2]), uint8, bytes32)'],
          [known.afterState]
        )
      ),
      known.afterInboxBatchAcc
    );
  }
  return concat(v);
}
