import type {
  ProofSequence,
  HexString,
  ProviderPair,
  HexAddress,
  HexString32,
} from '../types.js';
import { AbstractRollup, RollupCommit } from '../rollup.js';
import { EthProver } from '../eth/EthProver.js';
import { CachedValue } from '../cached.js';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { fetchBlock } from '../utils.js';
import { BigNumberish } from 'ethers';
import { isEIP4844 } from '../eth/types.js';
import { beaconConfigCache } from '../beacon.js';
import { decodeRlp } from 'ethers/utils';
import { getBytes } from 'ethers/utils';

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

export type OPBatchIndexCommit = RollupCommit<EthProver>;

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

  override async fetchLatestCommitIndex(): Promise<bigint> {
    const info = await this.findCommitTx(this.latestBlockTag, true);
    return BigInt(info.block.number);
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

  protected override async _fetchCommit(
    index: bigint
  ): Promise<OPBatchIndexCommit> {
    const [config, info] = await Promise.all([
      this.beaconConfig.get(),
      this.findCommitTx(index, false),
    ]);
    const sidecars = await config.fetchSidecars(BigInt(info.block.timestamp));
    for (const bvh of info.tx.blobVersionedHashes) {
      const sidecar = sidecars[bvh];
      if (!sidecar) throw new Error(`expected sidecar: ${bvh}`);
      try {
        const v = makeBlobCanonical(sidecar.blob);
        if (v[0] !== 0) continue;
        const frames = parseFrames(v.subarray(1));
        console.log(frames);
        const decoded = decodeRlp(frames[0].frameData);
        if (!Array.isArray(decoded) || decoded.length !== 5) {
          throw new Error('expected rlp array');
        }
        console.log(decoded);
      } catch (cause) {
        throw new Error(`invalid batcher transaction: ${bvh}`, { cause });
      }
    }

    return new EthProver(this.provider2, 'latest');
  }
  override encodeWitness(
    commit: OPBatchIndexCommit,
    proofSeq: ProofSequence
  ): HexString {
    throw new Error('Method not implemented.');
  }
  override windowFromSec(sec: number): number {
    throw new Error('Method not implemented.');
  }
}

function parseFrames(v: Uint8Array) {
  // https://specs.optimism.io/protocol/derivation.html#batcher-transaction-format
  const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
  const frames = [];
  let pos = 1;
  console.log(v);
  for (;;) {
    console.log(pos);
    const channelId = v.subarray(pos, (pos += 16));
    const frameNumber = dv.getUint16(pos);
    pos += 2;
    const frameLength = dv.getUint32(pos);
    pos += 4;
    const frameData = v.subarray(pos, (pos += frameLength));
    frames.push({
      channelId,
      frameNumber,
      frameLength,
      frameData,
    });
    console.log(frames.length, frames[frames.length - 1]);
    const isLast = v[pos++];
    console.log({ isLast });
    if (isLast) break;
  }
  return frames;
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
  const MaxBlobDataSize = (4 * 31 + 3) * 1024 - 4;
  const header = getBytes(blob.slice(0, 66));
  if (header[1] !== 1) throw new Error(`unknown blob version: ${header[1]}`);
  const n = header.getUint32(2) >> 8;
  if (n > MaxBlobDataSize)
    throw new Error(`blob too big: ${n} > ${MaxBlobDataSize}`);
  const v = new Uint8Array(MaxBlobDataSize);
  v.set(header.subarray(5));

  const N = 4096;
  const v = new Uint8Array(N * 31);
  for (let i = 0; i < N; i++) {
    const offset = 4 + (i << 6);
    v.set(getBytes('0x' + blob.slice(offset, offset + 62)), i * 31);
  }

  return v;
}
