import {
  type RollupCommit,
  type RollupDeployment,
  type RollupWitnessV1,
  AbstractRollup,
} from '../rollup.js';
import type {
  HexAddress,
  HexString,
  ProviderPair,
  ProofSequence,
  ProofSequenceV1,
  HexString32,
} from '../types.js';
import type { RPCEthGetBlock } from '../eth/types.js';
import { type ABINodeTuple, ROLLUP_ABI } from './types.js';
import { ZeroHash } from 'ethers/constants';
import { Contract, EventLog } from 'ethers/contract';
import { CHAINS } from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER, fetchBlockNumber, MAINNET_BLOCK_SEC } from '../utils.js';
import { encodeRlpBlock } from '../rlp.js';

// https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro#the-rollup-chain

export type NitroConfig = {
  Rollup: HexAddress;
  minAgeBlocks?: number;
};

export type NitroCommit = RollupCommit<EthProver> & {
  readonly sendRoot: HexString;
  readonly rlpEncodedBlock: HexString;
  readonly prevNum: bigint;
};

export class NitroRollup
  extends AbstractRollup<NitroCommit>
  implements RollupWitnessV1<NitroCommit>
{
  // https://docs.arbitrum.io/build-decentralized-apps/reference/useful-addresses
  static readonly arb1MainnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ARB1,
    Rollup: '0x5eF0D09d1E6204141B4d37530808eD19f60FBa35',
  };
  static readonly arb1SepoliaConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.ARB_SEPOLIA,
    Rollup: '0xd80810638dbDF9081b72C1B33c65375e807281C8',
  };
  static readonly arbNovaMainnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ARB_NOVA,
    Rollup: '0xFb209827c58283535b744575e11953DCC4bEAD88',
  };

  // https://docs.apechain.com/contracts/Mainnet/contract-information
  static readonly apeMainnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAINS.ARB1,
    chain2: CHAINS.APE,
    Rollup: '0x374de579AE15aD59eD0519aeAf1A23F348Df259c',
  };

  readonly Rollup: Contract;
  readonly minAgeBlocks;
  constructor(providers: ProviderPair, config: NitroConfig) {
    super(providers);
    this.Rollup = new Contract(config.Rollup, ROLLUP_ABI, this.provider1);
    this.minAgeBlocks = config.minAgeBlocks ?? 0;
  }

  override get unfinalized() {
    return !!this.minAgeBlocks;
  }

  private async _ensureUsableNode(index: bigint) {
    for (; index; index--) {
      const node: ABINodeTuple = await this.Rollup.getNode(index);
      if (node.stakerCount) break;
    }
    return index;
  }
  async fetchLatestNode(minAgeBlocks = 0): Promise<bigint> {
    if (minAgeBlocks) {
      const latest = await fetchBlockNumber(
        this.provider1,
        this.latestBlockTag
      );
      const index: bigint = await this.Rollup.latestNodeCreated({
        blockTag: latest - BigInt(minAgeBlocks),
      });
      return this._ensureUsableNode(index);
    } else {
      return this.Rollup.latestConfirmed({
        blockTag: this.latestBlockTag,
      });
    }
  }
  async fetchNodeData(index: bigint) {
    const [{ createdAtBlock, stakerCount, prevNum }, [event]] =
      await Promise.all([
        this.Rollup.getNode(index) as Promise<ABINodeTuple>,
        this.Rollup.queryFilter(
          this.unfinalized
            ? this.Rollup.filters.NodeCreated(index)
            : this.Rollup.filters.NodeConfirmed(index)
        ),
      ]);
    if (!createdAtBlock) throw new Error('unknown node');
    if (!stakerCount) throw new Error('no stakers');
    if (!(event instanceof EventLog)) throw new Error('no node event');
    let blockHash: HexString32;
    let sendRoot: HexString32;
    if (this.unfinalized) {
      // ethers bug: named abi parsing doesn't propagate through event tuples
      // [4][1][0][0] == event.args.afterState.globalState.bytes32Vals[0];
      [blockHash, sendRoot] = event.args[4][1][0][0];
    } else {
      blockHash = event.args[1];
      sendRoot = event.args[2];
    }
    return { prevNum, blockHash, sendRoot };
  }

  override fetchLatestCommitIndex(): Promise<bigint> {
    return this.fetchLatestNode(this.minAgeBlocks);
  }
  protected override async _fetchParentCommitIndex(
    commit: NitroCommit
  ): Promise<bigint> {
    return this.unfinalized
      ? this._ensureUsableNode(commit.index - 1n)
      : commit.prevNum;
  }
  protected override async _fetchCommit(index: bigint): Promise<NitroCommit> {
    const { prevNum, blockHash, sendRoot } = await this.fetchNodeData(index);
    const block: RPCEthGetBlock | null = await this.provider2.send(
      'eth_getBlockByHash',
      [blockHash, false]
    );
    if (!block) throw new Error(`no block: ${blockHash}`);
    // note: block.sendRoot == sendRoot
    const rlpEncodedBlock = encodeRlpBlock(block);
    const prover = new EthProver(this.provider2, block.number);
    return { index, prover, sendRoot, rlpEncodedBlock, prevNum };
  }
  override encodeWitness(
    commit: NitroCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256, bytes32, bytes, bytes[], bytes)'],
      [
        [
          commit.index,
          commit.sendRoot,
          commit.rlpEncodedBlock,
          proofSeq.proofs,
          proofSeq.order,
        ],
      ]
    );
  }
  encodeWitnessV1(commit: NitroCommit, proofSeq: ProofSequenceV1): HexString {
    return ABI_CODER.encode(
      [
        '(bytes32 version, bytes32 sendRoot, uint64 nodeIndex, bytes rlpEncodedBlock)',
        '(bytes, bytes[])',
      ],
      [
        [ZeroHash, commit.sendRoot, commit.index, commit.rlpEncodedBlock],
        [proofSeq.accountProof, proofSeq.storageProofs],
      ]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // the delta between createdAtBlock is a sufficient proxy
    return Math.ceil(sec / MAINNET_BLOCK_SEC); // units of L1 blocks
  }
}
