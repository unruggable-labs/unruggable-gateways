import { Interface } from 'ethers/abi';
import { CHAINS } from '../chains.js';
import {
  AbstractRollup,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type {
  HexAddress,
  HexString,
  HexString32,
  ProofSequence,
  ProviderPair,
} from '../types.js';
import { StarknetProver } from './StarknetProver.js';
import { Contract, EventLog } from 'ethers/contract';
import { ABI_CODER } from '../utils.js';
import { EthProver } from '../eth/EthProver.js';
import { encodeRlpBlock } from '../rlp.js';
import { dataSlice } from 'ethers/utils';
import { id as keccakStr } from 'ethers/hash';

const CORE_ABI = new Interface([
  `function stateRoot() view returns (bytes32)`,
  `function stateBlockNumber() view returns (uint256)`,
  `function updateStateKzgDA(uint256[] programOutput, bytes[] kzgProofs)`,
  `event LogStateUpdate(uint256 globalRoot, int256 blockNumber, uint256 blockHash)`,
]);

const SLOT_STATE_ROOT = BigInt(
  keccakStr('STARKNET_1.0_INIT_STARKNET_STATE_STRUCT')
);

export type StarknetConfig = {
  Rollup: HexAddress;
};

export type StarknetCommit = RollupCommit<StarknetProver> & {
  readonly rlpEncodedL1Block: HexString;
  readonly accountProof: HexString;
  readonly storageProof: HexString;
  readonly commitTx: HexString32;
};

export class StarknetRollup extends AbstractRollup<StarknetCommit> {
  // https://docs.starknet.io/tools/important-addresses/
  static readonly mainnetConfig: RollupDeployment<StarknetConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.STARKNET,
    Rollup: '0xc662c410C0ECf747543f5bA90660f6ABeBD9C8c4',
  };
  static readonly sepoliaConfig: RollupDeployment<StarknetConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.SCROLL_SEPOLIA,
    Rollup: '0xE2Bb56ee936fd6433DC0F6e7e3b8365C906AA057',
  };

  readonly Rollup: Contract;
  constructor(providers: ProviderPair, config: StarknetConfig) {
    super(providers);
    this.Rollup = new Contract(config.Rollup, CORE_ABI, this.provider1);
  }

  async findStateUpdate(l2BlockNumber: bigint): Promise<EventLog> {
    loop: for (
      let block = await this.provider1.getBlockNumber();
      block >= 0;
      block -= this.getLogsStepSize
    ) {
      const events = await this.Rollup.queryFilter(
        this.Rollup.filters.LogStateUpdate(),
        Math.max(0, block - this.getLogsStepSize),
        block
      );
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i] as EventLog;
        const bn = BigInt(dataSlice(event.data, 32, 64));
        if (bn === l2BlockNumber) return event;
        if (bn < l2BlockNumber) break loop;
      }
    }
    throw new Error(`not finalized: ${l2BlockNumber}`);
  }

  override fetchLatestCommitIndex(): Promise<bigint> {
    return this.Rollup.stateBlockNumber({
      blockTag: this.latestBlockTag,
    });
  }
  protected override async _fetchParentCommitIndex(
    commit: StarknetCommit
  ): Promise<bigint> {
    const tx = await this.provider1.getTransaction(commit.commitTx);
    if (!tx) throw new Error(`no commit: ${commit.commitTx}`);
    const desc = this.Rollup.interface.parseTransaction(tx);
    if (!desc || desc.name !== 'updateStateKzgDA') {
      throw new Error(`expected updateStateKzgDA: ${tx}`);
    }
    return desc.args.programOutput[2]; // prev blockNumber
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<StarknetCommit> {
    const event = await this.findStateUpdate(index);
    // const [event] = await this.Rollup.queryFilter(
    //   this.Rollup.filters.LogStateUpdate(null, index, null)
    // );
    // if (!event) throw new Error(`not finalized`);
    const prover1 = new EthProver(this.provider1, event.blockNumber);
    const [block, proof] = await Promise.all([
      prover1.fetchBlock(),
      prover1.fetchProofs(await this.Rollup.getAddress(), [SLOT_STATE_ROOT]),
    ]);
    const prover = new StarknetProver(this.provider2, Number(index));
    return {
      index,
      prover,
      commitTx: event.transactionHash,
      rlpEncodedL1Block: encodeRlpBlock(block),
      accountProof: EthProver.encodeProof(proof.accountProof),
      storageProof: EthProver.encodeProof(proof.storageProof[0].proof),
    };
  }
  override encodeWitness(
    commit: StarknetCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256, bytes, bytes, bytes, bytes[], bytes)'],
      [
        commit.index,
        commit.rlpEncodedL1Block,
        commit.accountProof,
        commit.storageProof,
        proofSeq.proofs,
        proofSeq.order,
      ]
    );
  }
  override windowFromSec(_sec: number): number {
    // finalization is not onchain
    // TODO: fix me
    return 69420;
  }
}
