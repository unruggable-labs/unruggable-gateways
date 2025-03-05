import type { ProviderPair, HexString32 } from '../types.js';
import { EventLog } from 'ethers/contract';
import { Log } from 'ethers/providers';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER } from '../utils.js';
import { encodeRlpBlock } from '../rlp.js';
import {
  AbstractArbitrumRollup,
  type ArbitrumConfig,
  type ArbitrumCommit,
} from './ArbitrumRollup.js';
import {
  type ABIAssertionNode,
  ASSERTION_STATUS_CONFIRMED,
  MACHINE_STATUS_FINISHED,
  ROLLUP_ABI,
  ROLLUP_PROOF_TYPES,
} from './BoLD.js';
import { CHAINS } from '../chains.js';
import { RollupDeployment } from '../rollup.js';

export type BoLDCommit = ArbitrumCommit & {
  readonly assertionHash: HexString32;
  readonly parentAssertionHash: HexString32;
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

  constructor(providers: ProviderPair, config: ArbitrumConfig) {
    super(providers, true, config, ROLLUP_ABI, 0);
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    const assertionHash: HexString32 = await this.Rollup.latestConfirmed({
      blockTag: this.latestBlockTag,
    });
    const [event] = await this.Rollup.queryFilter(
      this.Rollup.filters.AssertionCreated(assertionHash)
    );
    if (!(event instanceof EventLog)) throw new Error(`expected assertion`);
    return BigInt(event.blockNumber);
  }

  protected override async _fetchParentCommitIndex(
    commit: BoLDCommit
  ): Promise<bigint> {
    const node: ABIAssertionNode = await this.Rollup.getAssertion(
      commit.parentAssertionHash
    );
    return node.status ? node.createdAtBlock : -1n;
  }

  // search backwards, find the most recent that fits our criteria
  private async _requireLatestUsableAssertion(events: Log[]) {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (
        event instanceof EventLog &&
        event.args.assertion.afterState.machineStatus == MACHINE_STATUS_FINISHED
      ) {
        const node: ABIAssertionNode = await this.Rollup.getAssertion(
          event.args.assertionHash
        );
        if (node.status === ASSERTION_STATUS_CONFIRMED) {
          return event;
        }
      }
    }
    throw new Error('no usable assertion');
  }

  protected override async _fetchCommit(index: bigint): Promise<BoLDCommit> {
    const events = await this.Rollup.queryFilter(
      this.Rollup.filters.AssertionCreated(),
      index,
      index
    );
    if (!events.length) throw new Error('no assertion');
    const event = await this._requireLatestUsableAssertion(events);
    const parentAssertionHash: HexString32 = event.args.parentAssertionHash;
    const blockHash: HexString32 =
      event.args.assertion.afterState.globalState[0][0]; // bytes32Vals[0]
    const block = await this._fetchL2BlockFromHash(blockHash);
    const encodedRollupProof = ABI_CODER.encode(ROLLUP_PROOF_TYPES, [
      [
        parentAssertionHash,
        event.args.afterInboxBatchAcc,
        event.args.assertion.afterState,
        encodeRlpBlock(block),
      ],
    ]);
    return {
      index,
      prover: new EthProver(this.provider2, block.number),
      assertionHash: event.args.assertionHash,
      parentAssertionHash,
      encodedRollupProof,
    };
  }
}
