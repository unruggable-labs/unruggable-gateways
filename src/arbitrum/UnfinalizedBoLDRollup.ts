import type { ProviderPair, HexString32 } from '../types.js';
import { EventLog } from 'ethers/contract';
import { keccak256 } from 'ethers/crypto';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER, fetchBlockNumber } from '../utils.js';
import { encodeRlpBlock } from '../rlp.js';
import { CachedMap, CachedValue } from '../cached.js';
import {
  AbstractArbitrumRollup,
  type ArbitrumConfig,
  type ArbitrumCommit,
} from './ArbitrumRollup.js';
import { concat } from 'ethers/utils';
import {
  type ABIAssertionNode,
  type ABIAssertionState,
  MACHINE_STATUS_FINISHED,
  ROLLUP_ABI,
  ROLLUP_PROOF_TYPES,
} from './BoLD.js';

export type UnfinalizedBoLDCommit = ArbitrumCommit & {
  readonly assertionHashes: HexString32[];
};

type KnownAssertion = {
  readonly assertionHash: HexString32;
  readonly parentAssertionHash: HexString32;
  readonly afterState: ABIAssertionState;
  readonly afterInboxBatchAcc: HexString32;
  readonly createdAtBlock: bigint;
  confirmed: boolean;
};

export class UnfinalizedBoLDRollup extends AbstractArbitrumRollup<UnfinalizedBoLDCommit> {
  maxAssertions = 1000;
  constructor(
    providers: ProviderPair,
    config: ArbitrumConfig,
    minAgeBlocks: number = 1
  ) {
    super(providers, true, config, ROLLUP_ABI, minAgeBlocks);
  }

  _block0 = 0n;
  _block1 = 0n;
  readonly _assertionMap = new Map<HexString32, KnownAssertion>();
  private readonly _syncGuard = new CachedValue(async () => {
    const blockNumber = await fetchBlockNumber(
      this.provider1,
      this.latestBlockTag
    );
    if (this._block0 === this._block1) {
      const assertionHash: HexString32 = await this.Rollup.latestConfirmed({
        blockTag: blockNumber,
      });
      const [event] = await this.Rollup.queryFilter(
        this.Rollup.filters.AssertionCreated(assertionHash)
      );
      if (!(event instanceof EventLog)) {
        throw new Error(`expected latest assertion: ${assertionHash}`);
      }
      // let block0 = BigInt(event.blockNumber) - event.args.confirmPeriodBlocks;
      // if (block0 < 0) block0 = 0n;
      const block0 = BigInt(event.blockNumber);
      await this._syncAssertions(block0, blockNumber);
      this._block0 = block0;
    } else {
      await this._syncAssertions(this._block1 + 1n, blockNumber);
    }
  }, 60000);
  private async _syncAssertions(block: bigint, block1: bigint) {
    const topics = [
      [
        this.Rollup.filters.AssertionCreated().fragment.topicHash,
        this.Rollup.filters.AssertionConfirmed().fragment.topicHash,
      ],
    ];
    const inclusiveStep = BigInt(this.getLogsStepSize - 1);
    while (block <= block1) {
      let next = block + inclusiveStep;
      if (next > block1) next = block1;
      const events = await this.Rollup.queryFilter(topics, block, next);
      for (const e of events) {
        if (e instanceof EventLog) {
          const assertionHash: HexString32 = e.args.assertionHash;
          if (e.eventName === 'AssertionCreated') {
            if (
              e.args.assertion.afterState.machineStatus ==
              MACHINE_STATUS_FINISHED
            ) {
              const known: KnownAssertion = {
                assertionHash,
                parentAssertionHash: e.args.parentAssertionHash,
                createdAtBlock: BigInt(e.blockNumber),
                afterState: e.args.assertion.afterState,
                afterInboxBatchAcc: e.args.afterInboxBatchAcc,
                confirmed: false,
              };
              this._assertionMap.set(assertionHash, known);
            }
          } else {
            const known = this._assertionMap.get(assertionHash);
            if (known) known.confirmed = true;
          }
        }
      }
      block = next + 1n;
    }
    const iter = this._assertionMap.keys();
    while (this._assertionMap.size > this.maxAssertions) {
      this._assertionMap.delete(iter.next().value!);
    }
    this._block1 = block1;
  }

  private _latestAssertions() {
    // Map uses insertion order, which follows createdAtBlock
    return Array.from(this._assertionMap.values()).reverse();
  }

  async _findLatestAssertion(block?: bigint) {
    await this._syncGuard.get();
    block ??= this._block1 - BigInt(this.minAgeBlocks);
    const cached = new CachedMap<HexString32, ABIAssertionNode>(Infinity);
    for (const known of this._latestAssertions()) {
      if (known.createdAtBlock <= block) {
        const chain = await this.fetchAssertionChain(known.assertionHash);
        if (chain[0]?.confirmed) {
          const nodes = await Promise.all(
            chain
              .slice(1)
              .map((x) =>
                cached.get(x.assertionHash, (xx) =>
                  this.Rollup.getAssertion(xx)
                )
              )
          );
          // all unconfirmed assertions must be unchallenged
          if (nodes.every((x) => !x.secondChildBlock)) {
            return known;
          }
        }
      }
    }
    throw new Error(`unknown latest assertion at block: ${block}`);
  }

  async fetchAssertionChainAtIndex(index: bigint) {
    await this._syncGuard.get();
    for (const known of this._latestAssertions()) {
      if (known.createdAtBlock < index) break;
      if (known.createdAtBlock === index) {
        const chain = await this.fetchAssertionChain(known.assertionHash);
        if (chain[0]?.confirmed) return chain;
      }
    }
    throw new Error('no assertion');
  }
  async fetchAssertionChain(assertionHash: HexString32) {
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
    return chain.reverse();
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    const known = await this._findLatestAssertion();
    return known.createdAtBlock;
  }

  protected override async _fetchParentCommitIndex(
    commit: UnfinalizedBoLDCommit
  ): Promise<bigint> {
    const known = await this._findLatestAssertion(commit.index - 1n);
    return known.createdAtBlock;
  }

  protected override async _fetchCommit(
    index: bigint
  ): Promise<UnfinalizedBoLDCommit> {
    const chain = await this.fetchAssertionChainAtIndex(index);
    const { afterState } = chain[chain.length - 1];
    const blockHash = afterState.globalState[0][0];
    const block = await this._fetchL2BlockFromHash(blockHash);
    if (!block) throw new Error(`no block: ${blockHash}`);
    const encodedRollupProof = ABI_CODER.encode(ROLLUP_PROOF_TYPES, [
      [
        chain[0].assertionHash,
        encodeAssertionChain(chain.slice(1)),
        afterState,
        encodeRlpBlock(block),
      ],
    ]);
    return {
      index,
      prover: new EthProver(this.provider2, block.number),
      assertionHashes: chain.map((x) => x.assertionHash),
      encodedRollupProof,
    };
  }

  override async isCommitStillValid(
    commit: UnfinalizedBoLDCommit
  ): Promise<boolean> {
    const chain = await this.fetchAssertionChainAtIndex(commit.index);
    return (
      chain &&
      chain.every((x, i) => commit.assertionHashes[i] === x.assertionHash)
    );
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
