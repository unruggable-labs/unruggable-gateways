import {
  type RollupCommit,
  type RollupDeployment,
  AbstractRollup,
} from '../rollup.js';
import type {
  HexAddress,
  HexString32,
  HexString,
  ProviderPair,
  ProofSequence,
} from '../types.js';
import { Contract, EventLog } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { keccak256 } from 'ethers/crypto';
import { concat, getBytes } from 'ethers/utils';
import { CHAINS } from '../chains.js';
import { EthProver } from '../eth/EthProver.js';
import { ABI_CODER, fetchBlock, toPaddedHex } from '../utils.js';
import { CachedValue } from '../cached.js';
import { fetchBeaconData, fetchSidecars, type BlobSidecar } from '../beacon.js';
import { decompress } from 'fzstd';

// https://github.com/scroll-tech/go-ethereum/tree/24757865c6bbd9becb0256e97e8492d1f73987d9
// https://github.com/scroll-tech/scroll-contracts/blob/8e6a02b120d3a997f7c8e948b62bfb0e5b3ac185/src/L1/rollup/IScrollChain.sol

const ROLLUP_ABI = new Interface([
  `function lastFinalizedBatchIndex() view returns (uint256)`,
  `function finalizedStateRoots(uint256 batchIndex) view returns (bytes32)`,
  `event CommitBatch(
    uint256 indexed batchIndex,
    bytes32 indexed batchHash
  )`,
  `event FinalizeBatch(
    uint256 indexed batchIndex,
    bytes32 indexed batchHash,
    bytes32 stateRoot,
    bytes32 withdrawRoot
  )`,
  `function commitBatches(
    uint8 version,
    bytes32 parentBatchHash,
    bytes32 lastBatchHash,
  )`,
  `function commitAndFinalizeBatch(
    uint8 version,
    bytes32 parentBatchHash,
    (
      bytes batchHeader,
      uint256 totalL1MessagesPoppedOverall,
      bytes32 postStateRoot,
      bytes32 withdrawRoot,
      bytes zkProof
    ) finalizeStruct
  )`,
]);

const BATCH_VERSION = 7;

export type EuclidConfig = {
  ScrollChain: HexAddress;
};

export type EuclidCommit = RollupCommit<EthProver> & {
  readonly l1BlockNumber: number;
};

export class EuclidRollup extends AbstractRollup<EuclidCommit> {
  // https://etherscan.io/address/0xb7c8833F5627a8a12558cAFa0d0EBD1ACBDce43f
  static readonly mainnetConfig: RollupDeployment<EuclidConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.SCROLL,
    ScrollChain: '0xb7c8833F5627a8a12558cAFa0d0EBD1ACBDce43f',
  };
  // https://sepolia.etherscan.io/address/0x2D567EcE699Eabe5afCd141eDB7A4f2D0D6ce8a0
  static readonly sepoliaConfig: RollupDeployment<EuclidConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.SCROLL_SEPOLIA,
    ScrollChain: '0x2D567EcE699Eabe5afCd141eDB7A4f2D0D6ce8a0',
  };

  readonly ScrollChain: Contract;
  readonly beaconConfig = new CachedValue(async () => {
    const [genesis, spec] = await Promise.all(
      [
        `${this.beaconAPI}/eth/v1/beacon/genesis`,
        `${this.beaconAPI}/eth/v1/config/spec`,
      ].map(fetchBeaconData)
    );
    return {
      genesisTime: BigInt(genesis.genesis_time),
      secondsPerSlot: BigInt(spec.SECONDS_PER_SLOT),
    };
  }, Infinity);
  constructor(
    providers: ProviderPair,
    config: EuclidConfig,
    readonly beaconAPI: string
  ) {
    super(providers);
    this.ScrollChain = new Contract(
      config.ScrollChain,
      ROLLUP_ABI,
      this.provider1
    );
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return this.ScrollChain.lastFinalizedBatchIndex({
      blockTag: this.latestBlockTag,
    });
  }
  protected override async _fetchParentCommitIndex(
    commit: EuclidCommit
  ): Promise<bigint> {
    return this.ScrollChain.lastFinalizedBatchIndex({
      blockTag: commit.l1BlockNumber - 1,
    });
  }
  protected override async _fetchCommit(index: bigint): Promise<EuclidCommit> {
    // const [commitEvent] = await this.ScrollChain.queryFilter(
    //   this.ScrollChain.filters.CommitBatch(index)
    // );
    // const [finalEvent] = await this.ScrollChain.queryFilter(
    //   this.ScrollChain.filters.FinalizeBatch(index)
    // );
    const [[commitEvent], [finalEvent]] = await Promise.all([
      this.ScrollChain.queryFilter(this.ScrollChain.filters.CommitBatch(index)),
      this.ScrollChain.queryFilter(
        this.ScrollChain.filters.FinalizeBatch(index)
      ),
    ]);
    if (!commitEvent) throw new Error(`unknown batch`);
    if (!(finalEvent instanceof EventLog)) throw new Error('not finalized');
    const tx = await commitEvent.getTransaction();
    const desc = this.ScrollChain.interface.parseTransaction(tx);
    if (!desc) throw new Error(`expected commit tx: ${tx.hash}`);
    switch (desc.name) {
      case 'commitBatches':
      case 'commitAndFinalizeBatch':
        break;
      default:
        throw new Error(`unsupported commit tx: ${desc.name}`);
    }
    if (desc.args.version != BATCH_VERSION) {
      throw new Error(`unexpected version: ${desc.args.version}`);
    }
    if (!tx.blobVersionedHashes || !tx.blobVersionedHashes.length) {
      throw new Error(`expected blobs`);
    }
    const [config, block] = await Promise.all([
      this.beaconConfig.get(),
      fetchBlock(this.provider1, tx.blockNumber!),
    ]);
    const sidecars = await fetchSidecars(
      this.beaconAPI,
      (BigInt(block.timestamp) - config.genesisTime) / config.secondsPerSlot
    );
    let batchIndex =
      finalEvent.args.batchIndex - BigInt(tx.blobVersionedHashes.length - 1);
    let batchHash: HexString32 = desc.args.parentBatchHash;
    let sidecar!: BlobSidecar;
    for (const bvh of tx.blobVersionedHashes) {
      sidecar = sidecars[bvh];
      if (!sidecar) throw new Error(`expected sidecar: ${bvh}`);
      // https://github.com/scroll-tech/da-codec/blob/344f2d5e33e1930c63cd6a082ef77e27dbe50cea/encoding/codecv7.go#L168
      // https://github.com/scroll-tech/da-codec/blob/344f2d5e33e1930c63cd6a082ef77e27dbe50cea/encoding/codecv7_types.go#L125
      batchHash = keccak256(
        concat([
          toPaddedHex(BATCH_VERSION, 1),
          toPaddedHex(batchIndex++, 8),
          bvh,
          batchHash,
        ])
      );
    }
    if (batchHash !== finalEvent.args.batchHash) {
      //desc.args.lastBatchHash) {
      throw new Error(`invalid batchHash chain: ${batchHash}`);
    }
    const prover = new EthProver(
      this.provider2,
      lastBlockFromBlobV7(sidecar.blob)
    );
    return { index, prover, l1BlockNumber: finalEvent.blockNumber };
  }
  override encodeWitness(
    commit: EuclidCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256, bytes[], bytes)'],
      [[commit.index, proofSeq.proofs, proofSeq.order]]
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

function makeBlobCanonical(blob: HexString): Uint8Array {
  // https://github.com/scroll-tech/da-codec/blob/344f2d5e33e1930c63cd6a082ef77e27dbe50cea/encoding/da.go#L469
  const N = 4096;
  const v = new Uint8Array(N * 31);
  for (let i = 0; i < N; i++) {
    const offset = 4 + (i << 6);
    v.set(getBytes('0x' + blob.slice(offset, offset + 62)), i * 31);
  }
  return v;
}

function lastBlockFromBlobV7(blob: HexString) {
  //https://github.com/scroll-tech/da-codec/blob/344f2d5e33e1930c63cd6a082ef77e27dbe50cea/encoding/codecv7.go#L176
  let v = makeBlobCanonical(blob);
  if (v[0] != BATCH_VERSION) {
    throw new Error(`unexpected version: ${v[0]}`);
  }
  const compressed = v[4];
  if (compressed != 0 && compressed != 1) {
    throw new Error(`unexpected compression: ${v[4]}`);
  }
  const size = (v[1] << 16) | (v[2] << 8) | v[3]; // uint24
  if (compressed) {
    v = v.slice(1, 5 + size);
    // https://github.com/scroll-tech/da-codec/blob/344f2d5e33e1930c63cd6a082ef77e27dbe50cea/encoding/da.go#L50
    v[0] = 0x28; // zstdMagicNumber
    v[1] = 0xb5;
    v[2] = 0x2f;
    v[3] = 0xfd;
    v = decompress(v);
  } else {
    v = v.subarray(5, 5 + size);
  }
  // https://github.com/scroll-tech/da-codec/blob/344f2d5e33e1930c63cd6a082ef77e27dbe50cea/encoding/codecv7_types.go#L275
  if (v.length < 74) throw new Error(`payload too small: ${v.length}`); // blobPayloadV7MinEncodedLength
  const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
  const l2BlockNumber = dv.getBigUint64(64); // blobPayloadV7OffsetInitialL2BlockNumber
  const numBlocks = dv.getUint16(72); // blobPayloadV7OffsetNumBlocks
  return l2BlockNumber + BigInt(numBlocks - 1);
}
