import type {
  ProofSequence,
  HexString,
  ProviderPair,
  HexAddress,
  HexString32,
  BigNumberish,
} from '../types.js';
import { type RollupCommit, AbstractRollup } from '../rollup.js';
import { EthProver } from '../eth/EthProver.js';
import { CachedValue } from '../cached.js';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { ABI_CODER, dataViewFrom, fetchBlock } from '../utils.js';
import { isEIP4844 } from '../eth/types.js';
import { type BlobSidecar, beaconConfigCache } from '../beacon.js';
import { getBytes, hexlify } from 'ethers/utils';
import { deflate, brotliDecompress } from 'node:zlib';
import { decodeRlp, encodeRlpBlock } from '../rlp.js';

// Batch transactions are authenticated by verifying that the to address of the transaction matches the batch inbox address, and the from address matches the batch-sender address in the system configuration at the time of the L1 block that the transaction data is read from.

// https://etherscan.io/address/0xbEb5Fc579115071764c7423A4f12eDde41f106Ed#readProxyContract
const PORTAL_ABI = new Interface([
  `function systemConfig() view returns (address)`,
]);

// https://etherscan.io/address/0x229047fed2591dbec1eF1118d64F7aF3dB9EB290
const CONFIG_ABI = new Interface([
  // https://specs.optimism.io/protocol/configurability.html?highlight=batch%20inbox#batch-inbox-address
  // https://etherscan.io/address/0xFf00000000000000000000000000000000000010
  `function batchInbox() view returns (address)`,
  `function batcherHash() view returns (bytes32)`,
]);

export type OPBatchIndexConfig = {
  OptimismPortal: HexAddress;
};

export type OPBatchIndexCommit = RollupCommit<EthProver> & {
  rlpEncodedL1Block: HexString;
  rlpEncodedL2Block: HexString;
  sidecars: BlobSidecar[];
};

export class OPBatchInboxRollup extends AbstractRollup<OPBatchIndexCommit> {
  readonly OptimismPortal: Contract;
  readonly batchInboxConfig = new CachedValue(async () => {
    const System = new Contract(
      await this.OptimismPortal.systemConfig(),
      CONFIG_ABI,
      this.provider1
    );
    const [inbox, batcherHash] = await Promise.all([
      System.batchInbox() as Promise<HexAddress>,
      System.batcherHash() as Promise<HexString32>,
    ]);
    return {
      inbox: inbox.toLowerCase(),
      // Identifier for the batcher.
      // For version 1 of this configuration, this is represented as an address left-padded with zeros to 32 bytes.
      sender: '0x' + batcherHash.slice(-40),
    };
  }, Infinity);

  readonly beaconConfig;
  findBlockPrefixTimeoutMs = 10000;
  constructor(
    providers: ProviderPair,
    config: OPBatchIndexConfig,
    readonly beaconAPI: string
  ) {
    super(providers);
    this.beaconConfig = beaconConfigCache(beaconAPI);
    this.OptimismPortal = new Contract(
      config.OptimismPortal,
      PORTAL_ABI,
      providers.provider1
    );
  }

  async findCommitTx(blockTag: BigNumberish, search: boolean) {
    const { inbox, sender } = await this.batchInboxConfig.get();
    for (;;) {
      const block = await fetchBlock(this.provider1, blockTag, true);
      for (const tx of block.transactions) {
        // https://specs.optimism.io/protocol/derivation.html#l1-retrieval
        if (tx.to !== inbox || tx.from !== sender) continue; // not batch
        if (!isEIP4844(tx) || !tx.blobVersionedHashes.length) continue;
        return { block, tx };
      }
      if (!search || block.number === '0x0') throw new Error(`no commit tx`);
      blockTag = BigInt(block.number) - 1n;
    }
  }

  override async fetchLatestCommitIndex() {
    const info = await this.findCommitTx(this.latestBlockTag, true);
    return BigInt(info.block.number);
  }

  override async _fetchParentCommitIndex(commit: OPBatchIndexCommit) {
    const info = await this.findCommitTx(commit.index - 1n, true);
    return BigInt(info.block.number);
  }

  protected override async _fetchCommit(
    index: bigint
  ): Promise<OPBatchIndexCommit> {
    const [config, info] = await Promise.all([
      this.beaconConfig.get(),
      this.findCommitTx(index, false),
    ]);
    const sidecars = await config.fetchSidecars(BigInt(info.block.timestamp));
    const frames: Frame[] = [];
    for (const bvh of info.tx.blobVersionedHashes) {
      const sidecar = sidecars[bvh];
      if (!sidecar) throw new Error(`expected sidecar: ${bvh}`);
      try {
        const v = makeBlobCanonical(sidecar.blob);
        if (v[0] !== 0) continue;
        frames.push(...splitFrames(v.subarray(1)));
        console.log(sidecar.blob.length, sidecar.kzg_commitment.length * 64);
      } catch (cause) {
        throw new Error(`invalid batcher transaction: ${bvh}`, { cause });
      }
    }
    const frame = await decodeFrame(frames);
    console.log(frame);
    let l2Block = await fetchBlock(this.provider2, frame.l2BlockNumber);
    const timeout = Date.now() + this.findBlockPrefixTimeoutMs;
    for (;;) {
      if (l2Block.hash.startsWith(frame.l2BlockHashPrefix)) break;
      const blockNumber = BigInt(l2Block.number);
      console.log(blockNumber);
      if (!blockNumber || Date.now() > timeout) {
        throw new Error(`unable to find block: ${frame.l2BlockHashPrefix}`);
      }
      l2Block = await fetchBlock(this.provider2, blockNumber - 1n);
    }
    const l1Block = await fetchBlock(this.provider1, frame.l1BlockNumber);
    const prover = new EthProver(this.provider2, l2Block.number);
    return {
      index,
      prover,
      rlpEncodedL1Block: encodeRlpBlock(l1Block),
      rlpEncodedL2Block: encodeRlpBlock(l2Block),
      sidecars: info.tx.blobVersionedHashes.map((x) => sidecars[x]),
    };
  }
  override encodeWitness(commit: OPBatchIndexCommit, proofSeq: ProofSequence) {
    return ABI_CODER.encode(
      [`(uint256, bytes, bytes, bytes[], bytes[], bytes)`],
      [
        [
          commit.index,
          commit.rlpEncodedL1Block,
          commit.rlpEncodedL2Block,
          commit.sidecars.map((x) => x.blob), // FIX ME
          proofSeq.proofs,
          proofSeq.order,
        ],
      ]
    );
  }
  override windowFromSec(sec: number) {
    // transaction inclusion in L1 block provides timestamp
    return sec;
  }
}

function makeBlobCanonical(blob: HexString) {
  // https://github.com/ethereum-optimism/optimism/blob/4c48bb3d1a5a24d5745af0b509dfa7c1af6e69f1/op-service/eth/blob.go#L196
  // https://github.com/ethereum-optimism/optimism/blob/4c48bb3d1a5a24d5745af0b509dfa7c1af6e69f1/op-service/eth/blob.go#L80
  // FromData encodes the given input data into this blob. The encoding scheme is as follows:
  //
  // In each round we perform 7 reads of input of lengths (31,1,31,1,31,1,31) bytes respectively for
  // a total of 127 bytes. This data is encoded into the next 4 field elements of the output by
  // placing each of the 4x31 byte chunks into bytes [1:32] of its respective field element. The
  // three single byte chunks (24 bits) are split into 4x6-bit chunks, each of which is written into
  // the top most byte of its respective field element, leaving the top 2 bits of each field element
  // empty to avoid modulus overflow.  This process is repeated for up to 1024 rounds until all data
  // is encoded.
  //
  // For only the very first output field, bytes [1:5] are used to encode the version and the length
  // of the data
  const src = Buffer.from(blob.slice(2), 'hex'); // sidecars are already size checked
  const MAX = (4 * 31 + 3) * 1024 - 4;
  if (src[1] !== 0) throw new Error(`blob version: ${src[1]}`);
  const dstLen = dataViewFrom(src).getUint32(2) >> 8;
  if (dstLen > MAX) throw new Error(`blob too big: ${dstLen} > ${MAX}`);
  const dst = new Uint8Array(MAX);
  dst.set(src.subarray(5, 32));
  let dstPos = 28;
  let srcPos = 32;
  const buf = new Uint8Array(4);
  buf[0] = src[0];
  for (let i = 1; i < 4; i++) buf[i] = felt();
  reassemble();
  for (let round = 1; round < 1024 && dstPos < dstLen; round++) {
    for (let i = 0; i < 4; i++) buf[i] = felt();
    reassemble();
  }
  for (let i = dstLen; i < dst.length; i++) {
    if (dst[i]) throw new Error(`extraneous output data: ${i}`);
  }
  for (let i = srcPos; i < src.length; i++) {
    if (src[i]) throw new Error(`extraneous input data: ${i}`);
  }
  return dst.subarray(0, dstLen);
  function felt() {
    const first = src[srcPos];
    if (first & 0xc0) throw new Error(`invalid felt: ${srcPos}`);
    dst.set(src.subarray(srcPos + 1, (srcPos += 32)), dstPos);
    dstPos += 32;
    return first;
  }
  function reassemble() {
    --dstPos; // account for fact that we don't output a 128th byte
    dst[dstPos - 32] = (buf[2] & 0b0011_1111) | ((buf[3] & 0b0011_0000) << 2);
    dst[dstPos - 64] = (buf[1] & 0b0000_1111) | ((buf[3] & 0b0000_1111) << 4);
    dst[dstPos - 96] = (buf[0] & 0b0011_1111) | ((buf[1] & 0b0011_0000) << 2);
  }
}

type Frame = {
  channelId: HexString;
  frameNumber: number;
  frameLength: number;
  frameData: Uint8Array;
  isLast: boolean;
};

function splitFrames(v: Uint8Array): Frame[] {
  // https://specs.optimism.io/protocol/derivation.html#batcher-transaction-format
  const dv = dataViewFrom(v);
  const frames = [];
  for (let pos = 0; pos < v.length; ) {
    const channelId = hexlify(v.subarray(pos, (pos += 16)));
    const frameNumber = dv.getUint16(pos);
    pos += 2;
    const frameLength = dv.getUint32(pos);
    pos += 4;
    const frameData = v.subarray(pos, (pos += frameLength));
    const isLast = v[pos++] === 1;
    frames.push({
      channelId,
      frameNumber,
      frameLength,
      frameData,
      isLast,
    });
  }
  return frames;
}

async function decompressZlib(v: Uint8Array): Promise<Uint8Array> {
  if ((v[0] & 15) === 8) {
    // https://www.rfc-editor.org/rfc/rfc1950.html#ref-3
    if (v[1] & 32) throw new Error('unexpected FDICT');
    return new Promise((ful, rej) =>
      deflate(v.subarray(2, -4), (err, res) => (err ? rej(err) : ful(res)))
    );
  } else if (v[0] === 1) {
    return new Promise((ful, rej) =>
      brotliDecompress(v.subarray(1), (err, res) => (err ? rej(err) : ful(res)))
    );
  } else {
    throw new Error(`expected compressor: ${v[0]}`);
  }
}

async function decodeFrame(frames: Frame[]) {
  if (!frames.length) throw new Error(`expected frame`);
  const { channelId } = frames[0];
  frames = frames.filter((x) => x.channelId == channelId);
  if (
    !frames.every((x, i) => x.frameNumber === i) ||
    !frames[frames.length - 1].isLast
  ) {
    throw new Error(`incomplete channel: ${channelId}`);
  }
  const frameData = Buffer.concat(frames.map((x) => x.frameData));
  const decompressed = await decompressZlib(frameData);
  console.log(decompressed.slice(100));
  const encodedBatch = decodeRlp(decompressed);
  if (typeof encodedBatch !== 'string') throw new Error('wtf');
  const v = getBytes(encodedBatch);
  if (v[0] !== 1) throw new Error('expected delta');
  let pos = 1;
  const timestamp = readUvarint();
  const l1BlockNumber = readUvarint();
  const l2BlockHashPrefix = hexlify(v.subarray(pos + 0, pos + 20));
  const l1BlockHashPrefix = hexlify(v.subarray(pos + 20, pos + 40));
  function readUvarint() {
    let u = 0n;
    for (let i = 0; ; i += 7) {
      const x = v[pos++];
      u |= BigInt(x & 127) << BigInt(i);
      if (x < 128) break;
    }
    return u;
  }
  return {
    timestamp,
    l2BlockNumber: timestamp >> 1n,
    l1BlockNumber,
    l2BlockHashPrefix,
    l1BlockHashPrefix,
  };
}
