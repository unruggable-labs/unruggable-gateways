import {
  type RollupCommit,
  type RollupWitnessV1,
  AbstractRollup,
} from '../rollup.js';
import type {
  HexAddress,
  HexString,
  ProviderPair,
  ProofSequence,
  ProofSequenceV1,
} from '../types.js';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { concat, dataSlice } from 'ethers/utils';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER, toPaddedHex } from '../utils.js';

// https://github.com/scroll-tech/scroll-contracts/
// https://docs.scroll.io/en/developers/ethereum-and-scroll-differences/
// https://status.scroll.io/
// https://github.com/scroll-tech/scroll/tree/738c85759d0248c005469972a49fc983b031ff1c/contracts/src/L1

const ROLLUP_ABI = new Interface([
  `function lastFinalizedBatchIndex() view returns (uint256)`,
  `function finalizedStateRoots(uint256 batchIndex) view returns (bytes32)`,
  `event FinalizeBatch(
    uint256 indexed batchIndex,
    bytes32 indexed batchHash,
    bytes32 stateRoot,
    bytes32 withdrawRoot
  )`,
  `event CommitBatch(
    uint256 indexed batchIndex,
    bytes32 indexed batchHash
  )`,
  `function commitBatchWithBlobProof(
    uint8 version,
    bytes parentBatchHeader,
    bytes[] chunks,
    bytes skippedL1MessageBitmap,
    bytes blobDataProof
  )`,
  `function commitBatch(
    uint8 version,
    bytes calldata parentBatchHeader,
    bytes[] memory chunks,
    bytes calldata skippedL1MessageBitmap
   )`,
]);

export type ScrollConfig = {
  ScrollChain: HexAddress;
  poseidon: HexAddress;
};

export type ScrollCommit = RollupCommit<EthProver> & {
  readonly l1BlockNumber: number;
};

// 20240815: commits are approximately every minute
// to make caching useful, we align to a step
// note: use 1 to disable the alignment
// 20240827: finalization is every ~15 min

export class ScrollRollup
  extends AbstractRollup<ScrollCommit>
  implements RollupWitnessV1<ScrollCommit>
{
  // 20250417: https://x.com/Scroll_ZKP/status/1912944671686533541
  // https://docs.scroll.io/en/developers/scroll-contracts/
  // https://etherscan.io/address/0xC4362457a91B2E55934bDCb7DaaF6b1aB3dDf203
  // https://mainnet-api-re.scroll.io/api/
  // https://scrollscan.com/batches
  // static readonly mainnetConfig: RollupDeployment<ScrollConfig> = {
  //   chain1: CHAINS.MAINNET,
  //   chain2: CHAINS.SCROLL,
  //   ScrollChain: '0xa13BAF47339d63B743e7Da8741db5456DAc1E556',
  //   poseidon: '0x3508174Fa966e75f70B15348209E33BC711AE63e',
  // };
  // 20250307: https://sepolia.etherscan.io/tx/0xa8c2e812c47ff2f076a64687d380fa3b79cccfa5bc8368be1993907788f3ee50
  // https://sepolia.etherscan.io/address/0x64cb3A0Dcf43Ae0EE35C1C15edDF5F46D48Fa570
  // https://sepolia-api-re.scroll.io/api/
  // https://sepolia.scrollscan.com/batches
  // static readonly sepoliaConfig: RollupDeployment<ScrollConfig> = {
  //   chain1: CHAINS.SEPOLIA,
  //   chain2: CHAINS.SCROLL_SEPOLIA,
  //   ScrollChain: '0x2D567EcE699Eabe5afCd141eDB7A4f2D0D6ce8a0',
  //   poseidon: '0xFeE7242E8587d7E22Ea5E9cFC585d0eDB6D57faA',
  // };

  readonly ScrollChain: Contract;
  readonly poseidon: HexAddress;
  constructor(providers: ProviderPair, config: ScrollConfig) {
    super(providers);
    this.ScrollChain = new Contract(
      config.ScrollChain,
      ROLLUP_ABI,
      this.provider1
    );
    this.poseidon = config.poseidon;
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return this.ScrollChain.lastFinalizedBatchIndex({
      blockTag: this.latestBlockTag,
    });
  }
  protected override async _fetchParentCommitIndex(
    commit: ScrollCommit
  ): Promise<bigint> {
    return this.ScrollChain.lastFinalizedBatchIndex({
      blockTag: commit.l1BlockNumber - 1,
    });
  }
  protected override async _fetchCommit(index: bigint): Promise<ScrollCommit> {
    // 20241029: removed offchain indexer dependency
    const [[commitEvent], [finalEvent]] = await Promise.all([
      this.ScrollChain.queryFilter(this.ScrollChain.filters.CommitBatch(index)),
      this.ScrollChain.queryFilter(
        this.ScrollChain.filters.FinalizeBatch(index)
      ),
    ]);
    if (!commitEvent) throw new Error(`unknown batch`);
    if (!finalEvent) throw new Error('not finalized');
    const tx = await commitEvent.getTransaction();
    const desc = this.ScrollChain.interface.parseTransaction(tx);
    if (!desc) throw new Error(`unknown transaction: ${tx.hash}`);
    const { chunks } = desc.args;
    if (!Array.isArray(chunks)) throw new Error('no chunks');
    const prover = new EthProver(this.provider2, lastBlockFromChunks(chunks));
    return { index, prover, l1BlockNumber: finalEvent.blockNumber };
  }
  override encodeWitness(
    commit: ScrollCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256, bytes[], bytes)'],
      [[commit.index, proofSeq.proofs, proofSeq.order]]
    );
  }
  encodeWitnessV1(commit: ScrollCommit, proofSeq: ProofSequenceV1): HexString {
    const compressed = proofSeq.storageProofs.map((storageProof) =>
      concat([
        toPaddedHex(proofSeq.accountProof.length, 1),
        ...proofSeq.accountProof,
        toPaddedHex(storageProof.length, 1),
        ...storageProof,
      ])
    );
    return ABI_CODER.encode(
      ['(uint256)', '(bytes, bytes[])'],
      [[commit.index], ['0x', compressed]]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // https://etherscan.io/advanced-filter?eladd=0xa13baf47339d63b743e7da8741db5456dac1e556&eltpc=0x26ba82f907317eedc97d0cbef23de76a43dd6edb563bdb6e9407645b950a7a2d
    const span = 20; // every 10-20 batches
    const freq = 3600; // every hour?
    return span * Math.ceil(sec / freq); // units of batchIndex
  }
}

function lastBlockFromChunks(chunks: HexString[]): bigint {
  // this supports V0 and V1
  // https://docs.scroll.io/en/technology/chain/rollup/#chunk-codec
  // https://github.com/scroll-tech/scroll-contracts/blob/main/src/libraries/codec/ChunkCodecV0.sol
  // https://github.com/scroll-tech/scroll-contracts/blob/main/src/libraries/codec/ChunkCodecV1.sol
  // this likely doesn't happen due to ErrorBatchIsEmpty()
  if (!chunks.length) throw new Error('no chunks');
  const chunk = chunks[chunks.length - 1];
  const SIZE = 60;
  const count = parseInt(chunk.slice(0, 4)); // uint8 => numBlocks
  const pos = 1 + SIZE * (count - 1);
  return BigInt(dataSlice(chunk, pos, pos + 8)); // uint64 => block[numBlocks - 1].blockIndex
}
