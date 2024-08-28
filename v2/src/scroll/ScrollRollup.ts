import {
  concatHex,
  encodeAbiParameters,
  parseAbiParameters,
  toHex,
} from 'viem';
import { readContract } from 'viem/actions';
import { mainnet, scroll, scrollSepolia, sepolia } from 'viem/chains';

import { CachedMap } from '../cached.js';
import { EthProver } from '../eth/EthProver.js';
import {
  AbstractRollupV1,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type {
  ClientPair,
  EncodedProof,
  HexAddress,
  HexString,
} from '../types.js';
import { poseidonAbi, rollupAbi, verifierAbi } from './abi.js';
import { type ScrollApiResponse } from './types.js';

// https://github.com/scroll-tech/scroll-contracts/
// https://docs.scroll.io/en/developers/ethereum-and-scroll-differences/
// https://status.scroll.io/

export type ScrollConfig = {
  scrollChainCommitmentVerifierAddress: HexAddress;
  apiURL: string;
  commitStep: number;
};

export type ScrollCommit = RollupCommit<EthProver>;

// 20240815: commits are approximately every minute
// to make caching useful, we align to a step
// note: use 1 to disable the alignment
const commitStep = 15; // effectively minutes

export class ScrollRollup extends AbstractRollupV1<ScrollCommit> {
  // https://docs.scroll.io/en/developers/scroll-contracts/
  static readonly mainnetConfig: RollupDeployment<ScrollConfig> = {
    chain1: mainnet.id,
    chain2: scroll.id,
    scrollChainCommitmentVerifierAddress:
      '0xC4362457a91B2E55934bDCb7DaaF6b1aB3dDf203',
    apiURL: 'https://mainnet-api-re.scroll.io/api/',
    commitStep,
  } as const;
  static readonly testnetConfig: RollupDeployment<ScrollConfig> = {
    chain1: sepolia.id,
    chain2: scrollSepolia.id,
    scrollChainCommitmentVerifierAddress:
      '0x64cb3A0Dcf43Ae0EE35C1C15edDF5F46D48Fa570',
    apiURL: 'https://sepolia-api-re.scroll.io/api/',
    commitStep,
  } as const;

  static async create(clients: ClientPair, config: ScrollConfig) {
    const commitmentVerifier = {
      address: config.scrollChainCommitmentVerifierAddress,
      abi: verifierAbi,
    } as const;
    const [rollupAddress, poseidonAddress] = await Promise.all([
      readContract(clients.client1, {
        ...commitmentVerifier,
        functionName: 'rollup',
      }),
      readContract(clients.client1, {
        ...commitmentVerifier,
        functionName: 'poseidon',
      }),
    ]);

    const rollup = {
      address: rollupAddress,
      abi: rollupAbi,
    };
    const poseidon = {
      address: poseidonAddress,
      abi: poseidonAbi,
    };
    return new this(
      clients,
      config.apiURL,
      BigInt(config.commitStep),
      commitmentVerifier,
      rollup,
      poseidon
    );
  }
  private constructor(
    clients: ClientPair,
    readonly apiURL: string,
    readonly commitStep: bigint,
    readonly commitmentVerifier: {
      address: HexAddress;
      abi: typeof verifierAbi;
    },
    readonly rollup: { address: HexAddress; abi: typeof rollupAbi },
    readonly poseidon: { address: HexAddress; abi: typeof poseidonAbi }
  ) {
    super(clients);
  }

  async fetchAPILatestCommitIndex(): Promise<bigint> {
    console.log('fetchAPILatestCommitIndex');
    // we require the offchain indexer to map commit index to block
    // so we can use the same indexer to get the latest commit
    const res = await fetch(new URL('./last_batch_indexes', this.apiURL));
    if (!res.ok) throw new Error(`${res.url}: HTTP(${res.status})`);
    const json: ScrollApiResponse['/last_batch_indexes'] = await res.json();
    return BigInt(json.finalized_index);
  }
  async fetchAPIBlockFromCommitIndex(index: bigint) {
    // TODO: determine how to this w/o relying on indexer
    const url = new URL('./batch', this.apiURL);
    url.searchParams.set('index', index.toString());
    console.log(url.toString());
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.url}: HTTP(${res.status})`);
    const json: ScrollApiResponse['/batch'] = await res.json();
    const {
      batch: { rollup_status, end_block_number },
    } = json;
    if (rollup_status !== 'finalized') {
      throw new Error(
        `Batch(${index}) not finalized: Status(${rollup_status})`
      );
    }
    return end_block_number;
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    const index = await this.fetchAPILatestCommitIndex();
    return index - (index % this.commitStep); // align to commit step
  }
  override async fetchParentCommitIndex(commit: ScrollCommit): Promise<bigint> {
    // [0, index] is finalized
    // https://github.com/scroll-tech/scroll/blob/738c85759d0248c005469972a49fc983b031ff1c/contracts/src/L1/rollup/ScrollChain.sol#L228
    const rem = commit.index % this.commitStep;
    if (rem) return commit.index - rem; // if not aligned, align to step
    return commit.index - this.commitStep; // else, use previous step
  }
  override async fetchCommit(index: bigint): Promise<ScrollCommit> {
    const blockNumber = await this.fetchAPIBlockFromCommitIndex(index);
    return {
      index,
      prover: new EthProver(
        this.client2,
        BigInt(blockNumber),
        new CachedMap(Infinity, this.commitCacheSize)
      ),
    };
  }
  override encodeWitness(
    commit: ScrollCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'bytes[]' }, { type: 'bytes' }],
      [commit.index, proofs, toHex(order)]
    );
  }
  override encodeWitnessV1(
    commit: ScrollCommit,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ): HexString {
    const compressed = storageProofs.map((storageProof) =>
      concatHex([
        toHex(accountProof.length, { size: 1 }),
        accountProof,
        toHex(storageProof.length, { size: 1 }),
        storageProof,
      ])
    );
    return encodeAbiParameters(
      parseAbiParameters('(uint256), (bytes, bytes[])'),
      [[commit.index], ['0x', compressed]]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    const step = Number(this.commitStep);
    const count = sec / 60; // every minute (see above: "commitStep")
    return step * Math.ceil(count / step); // units of commit index
  }
}
