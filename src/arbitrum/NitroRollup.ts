import type { RollupDeployment, RollupWitnessV1 } from '../rollup.js';
import {
  type ArbitrumCommit,
  type ArbitrumConfig,
  ArbitrumRollup,
} from './ArbitrumRollup.js';
import type {
  HexString,
  ProviderPair,
  ProofSequenceV1,
  HexString32,
} from '../types.js';
import type { RPCEthGetBlock } from '../eth/types.js';
import { Interface } from 'ethers/abi';
import { ZeroHash } from 'ethers/constants';
import { EventLog } from 'ethers/contract';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER, fetchBlockNumber } from '../utils.js';
import { encodeRlpBlock } from '../rlp.js';
import { CHAINS } from '../chains.js';

// https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro#the-rollup-chain

// https://github.com/OffchainLabs/nitro-contracts/blob/pre-bold/src/rollup/RollupCore.sol
const ROLLUP_ABI = new Interface([
  `function latestConfirmed() view returns (uint64)`,
  `function latestNodeCreated() view returns (uint64)`,
  `function countStakedZombies(uint64 nodeNum) view returns (uint256)`,
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

type ABINodeTuple = {
  readonly prevNum: bigint;
  readonly stakerCount: bigint;
  readonly createdAtBlock: bigint;
};

export type NitroCommit = ArbitrumCommit & {
  readonly prevNum: bigint;
  readonly sendRoot: HexString32;
  readonly rlpEncodedBlock: HexString;
};

type NitroConfig = ArbitrumConfig & { isBoLD: false };

export class NitroRollup
  extends ArbitrumRollup<NitroCommit>
  implements RollupWitnessV1<NitroCommit>
{
  // [OLD] https://docs.arbitrum.io/build-decentralized-apps/reference/useful-addresses
  // https://docs.arbitrum.io/for-devs/dev-tools-and-resources/chain-info#core-contracts
  // 20250212: changed to BoLD
  // https://x.com/arbitrum/status/1889710151332245837
  // static readonly arb1MainnetConfig: RollupDeployment<NitroConfig> = {
  //   chain1: CHAINS.MAINNET,
  //   chain2: CHAINS.ARB1,
  //   Rollup: '0x5eF0D09d1E6204141B4d37530808eD19f60FBa35',
  // };
  // static readonly arb1SepoliaConfig: RollupDeployment<ArbitrumConfig> = {
  //   chain1: CHAINS.SEPOLIA,
  //   chain2: CHAINS.ARB_SEPOLIA,
  //   Rollup: '0x042B2E6C5E99d4c521bd49beeD5E99651D9B0Cf4',
  // };
  static readonly arbNovaMainnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ARB_NOVA,
    Rollup: '0xFb209827c58283535b744575e11953DCC4bEAD88',
    isBoLD: false,
  };
  // https://docs.apechain.com/contracts/Mainnet/contract-information
  static readonly apeMainnetConfig: RollupDeployment<NitroConfig> = {
    chain1: CHAINS.ARB1,
    chain2: CHAINS.APE,
    Rollup: '0x374de579AE15aD59eD0519aeAf1A23F348Df259c',
    isBoLD: false,
  };

  constructor(
    providers: ProviderPair,
    config: ArbitrumConfig,
    minAgeBlocks = 0
  ) {
    super(providers, false, config, ROLLUP_ABI, minAgeBlocks);
  }

  private async _getNode(index: bigint): Promise<ABINodeTuple> {
    return this.Rollup.getNode(index);
  }
  private async _countStakedZombies(index: bigint): Promise<bigint> {
    return this.Rollup.countStakedZombies(index);
  }
  private async _ensureUsableNode(index: bigint) {
    for (; index; index--) {
      const [node, zombies] = await Promise.all([
        this._getNode(index),
        this._countStakedZombies(index),
      ]);
      if (node.stakerCount > zombies) break;
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
    const [{ createdAtBlock, stakerCount, prevNum }, zombies, [event]] =
      await Promise.all([
        this._getNode(index),
        this.unfinalized ? this._countStakedZombies(index) : 0n,
        this.Rollup.queryFilter(
          this.unfinalized
            ? this.Rollup.filters.NodeCreated(index)
            : this.Rollup.filters.NodeConfirmed(index)
        ),
      ]);
    if (!createdAtBlock) throw new Error('unknown node');
    if (!(event instanceof EventLog)) throw new Error('no node event');
    let blockHash: HexString32;
    let sendRoot: HexString32;
    if (this.unfinalized) {
      if (stakerCount <= zombies) throw new Error('no stakers');
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
    const encodedRollupProof = ABI_CODER.encode(
      ['(uint64, bytes32, bytes)'],
      [[prevNum, sendRoot, rlpEncodedBlock]]
    );
    const prover = new EthProver(this.provider2, block.number);
    return {
      index,
      prover,
      encodedRollupProof,
      sendRoot,
      rlpEncodedBlock,
      prevNum,
    };
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
}
