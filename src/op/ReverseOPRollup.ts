import { AbstractRollup, align, type RollupCommit } from '../rollup.js';
import type {
  EncodedProof,
  HexAddress,
  HexString,
  ProviderPair,
  ProofSequence,
} from '../types.js';
import { ABI_CODER, EVM_BLOCKHASH_DEPTH, MAINNET_BLOCK_SEC } from '../utils.js';
import { EthProver } from '../eth/EthProver.js';
import { encodeRlpBlock } from '../rlp.js';
import { dataSlice } from 'ethers/utils';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';

export const L1_BLOCK_ABI = new Interface([
  `function number() view returns (uint256)`,
]);

export type OPReverseConfig = {
  L1Block?: HexAddress;
  //storageSlot?: bigint;
};

// https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/L2/L1Block.sol
// TODO: should these be settings?
// (the contract needs to know SLOT_HASH)
const SLOT_NUMBER = 0n;
const SLOT_HASH = 2n;

export type ReverseOPCommit = RollupCommit<EthProver> & {
  readonly rlpEncodedL1Block: HexString;
  readonly rlpEncodedL2Block: HexString;
  readonly accountProof: EncodedProof;
  readonly storageProof: EncodedProof;
};

const L1Block = '0x4200000000000000000000000000000000000015'; // default deployment

// TODO: switch this to using previousBeaconRoot
// see: test/research/eip-4788/

// im using chain1 as mainnet and chain2 as op
// however the proving is from chain2 to chain1
// either rename chain1/chain2 to chainCall/chainData
// or add direction: 1=>2 or 2=>1
// 20241116: testName() has reverse, but not a feature of the Rollup yet

export class ReverseOPRollup extends AbstractRollup<ReverseOPCommit> {
  readonly L1Block: Contract;
  //readonly storageSlot: bigint; // using const SLOT_* instead
  constructor(
    providers: ProviderPair,
    config: OPReverseConfig & Record<string, unknown>, // relax
    readonly commitStep = 1
  ) {
    super(providers);
    //this.latestBlockTag = 'latest'; // 20240922: not necessary
    this.L1Block = new Contract(
      config.L1Block ?? L1Block,
      L1_BLOCK_ABI,
      this.provider2
    );
  }

  async findL2Block(l1BlockNumber: bigint) {
    let b = (await this.provider2.getBlockNumber()) + 1;
    let a = Math.max(0, b - EVM_BLOCKHASH_DEPTH);
    while (a < b) {
      const middle = Math.floor((a + b) / 2);
      const value = await this.provider2.getStorage(
        this.L1Block.target,
        SLOT_NUMBER,
        middle
      );
      const block = BigInt(dataSlice(value, 24, 32)); // uint64
      if (block == l1BlockNumber) return BigInt(middle);
      if (block > l1BlockNumber) {
        b = middle;
      } else {
        a = middle + 1;
      }
    }
    throw new Error(`unable to find block: ${l1BlockNumber}`);
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return align(
      await this.L1Block.number({ blockTag: this.latestBlockTag }),
      this.commitStep
    );
  }
  protected override async _fetchParentCommitIndex(
    commit: ReverseOPCommit
  ): Promise<bigint> {
    return align(commit.index - 1n, this.commitStep);
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<ReverseOPCommit> {
    const prover = new EthProver(this.provider1, index);
    const prover2 = new EthProver(
      this.provider2,
      await this.findL2Block(index)
    );
    const [l1BlockInfo, l2BlockInfo, proof] = await Promise.all([
      prover.fetchBlock(),
      prover2.fetchBlock(),
      prover2.fetchProofs(this.L1Block.target as string, [SLOT_HASH]),
    ]);
    return {
      index,
      rlpEncodedL1Block: encodeRlpBlock(l1BlockInfo),
      rlpEncodedL2Block: encodeRlpBlock(l2BlockInfo),
      accountProof: EthProver.encodeProof(proof.accountProof),
      storageProof: EthProver.encodeProof(proof.storageProof[0].proof),
      prover,
    };
  }

  override encodeWitness(
    commit: ReverseOPCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(bytes, bytes, bytes, bytes, bytes[], bytes)'],
      [
        [
          commit.rlpEncodedL1Block,
          commit.rlpEncodedL2Block,
          commit.accountProof,
          commit.storageProof,
          proofSeq.proofs,
          proofSeq.order,
        ],
      ]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization is not on chain
    // L1 block time is 12 sec
    return Math.ceil(sec / MAINNET_BLOCK_SEC);
  }
}
