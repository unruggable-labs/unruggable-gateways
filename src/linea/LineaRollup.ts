import {
  type RollupDeployment,
  type RollupCommit,
  AbstractRollup,
} from '../rollup.js';
import type {
  HexAddress,
  HexString,
  HexString32,
  ProviderPair,
  ProofSequence,
} from '../types.js';
import { Contract, EventLog } from 'ethers/contract';
import { LineaProver } from './LineaProver.js';
import { ROLLUP_ABI } from './types.js';
import { CHAINS } from '../chains.js';
import { ABI_CODER } from '../utils.js';

// https://docs.linea.build/developers/quickstart/ethereum-differences
// https://github.com/Consensys/linea-contracts
// https://consensys.io/diligence/audits/2024/06/linea-ens/
// https://github.com/Consensys/linea-monorepo/blob/main/contracts/test/SparseMerkleProof.ts
// https://github.com/Consensys/linea-ens/blob/main/packages/linea-state-verifier/contracts/LineaSparseProofVerifier.sol

export type LineaConfig = {
  L1MessageService: HexAddress;
  SparseMerkleProof: HexAddress;
  firstCommitV3?: bigint;
};

export type LineaCommit = RollupCommit<LineaProver> & {
  readonly stateRoot: HexString32;
  readonly prevStateRoot: HexString32;
  readonly startIndex: bigint | undefined;
};

export class LineaRollup extends AbstractRollup<LineaCommit> {
  static readonly ROLLUP_ABI = ROLLUP_ABI;

  // https://docs.linea.build/developers/quickstart/info-contracts
  static readonly mainnetConfig: RollupDeployment<LineaConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.LINEA,
    L1MessageService: '0xd19d4B5d358258f05D7B411E21A1460D11B0876F',
    // https://github.com/Consensys/linea-ens/blob/main/packages/linea-ens-resolver/deployments/mainnet/SparseMerkleProof.json
    SparseMerkleProof: '0xBf8C454Af2f08fDD90bB7B029b0C2c07c2a7b4A3',
    // deploy: https://etherscan.io/tx/0x9ec6d0ac71da8691a84352a38be79dcee841d9440ce536452ad50cd380bd31b1
    // commit: https://etherscan.io/tx/0xc6b2c65a7b69276e191d11802d5cda28d8feb4736afd7d47695b9cd9ea3ceb81
    firstCommitV3: 13377143n,
  };
  static readonly sepoliaConfig: RollupDeployment<LineaConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.LINEA_SEPOLIA,
    L1MessageService: '0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5',
    // https://github.com/Consensys/linea-ens/blob/main/packages/linea-ens-resolver/deployments/sepolia/SparseMerkleProof.json
    SparseMerkleProof: '0x718D20736A637CDB15b6B586D8f1BF081080837f',
    // deploy: https://sepolia.etherscan.io/tx/0x5a59e374a18369aa624fbc5afa77864aec1a1e19f38769c18d55318937f79356
    // commit: https://sepolia.etherscan.io/tx/0xa2a4a0cf7205e7dc6eac8cdef5a7fd1cb750dac25539e6886e76f76278c27893
    firstCommitV3: 6391917n,
  };

  readonly firstCommitV3: bigint | undefined;
  readonly L1MessageService: Contract;
  readonly SparseMerkleProof: HexAddress;
  shomeiTimeout = 30000;
  constructor(providers: ProviderPair, config: LineaConfig) {
    super(providers);
    this.L1MessageService = new Contract(
      config.L1MessageService,
      ROLLUP_ABI,
      this.provider1
    );
    this.firstCommitV3 = config.firstCommitV3;
    this.SparseMerkleProof = config.SparseMerkleProof;
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    // 20241112: BLOCK_MISSING_IN_CHAIN
    // https://github.com/Consensys/shomei/issues/98
    // https://github.com/Consensys/shomei/issues/104
    const index: bigint = await this.L1MessageService.currentL2BlockNumber({
      blockTag: this.latestBlockTag,
    });
    const timeout = Date.now() + this.shomeiTimeout;
    let commit = await this.fetchCommit(index);
    for (;;) {
      if (await commit.prover.isShomeiReady()) return commit.index;
      if (Date.now() > timeout) throw new Error(`timeout isShomeiReady()`);
      commit = await this.fetchParentCommit(commit);
    }
  }
  protected override async _fetchParentCommitIndex(
    commit: LineaCommit
  ): Promise<bigint> {
    if (commit.startIndex) return commit.startIndex - 1n;
    const [event] = await this.L1MessageService.queryFilter(
      this.L1MessageService.filters.DataFinalized(
        null,
        null,
        commit.prevStateRoot
      )
    );
    if (!(event instanceof EventLog)) {
      throw new Error('no prior DataFinalized event');
    }
    return BigInt(event.args.lastBlockFinalized);
  }
  protected override async _fetchCommit(index: bigint): Promise<LineaCommit> {
    let prevStateRoot: HexString32;
    let stateRoot: HexString32;
    let startIndex: bigint | undefined;
    if (this.firstCommitV3 && index >= this.firstCommitV3) {
      const [event] = await this.L1MessageService.queryFilter(
        this.L1MessageService.filters.DataFinalizedV3(null, index)
      );
      if (!(event instanceof EventLog)) {
        throw new Error('no DataFinalizedV3 event');
      }
      startIndex = event.args.startBlockNumber;
      prevStateRoot = event.args.parentStateRootHash;
      stateRoot = event.args.finalStateRootHash;
    } else {
      const [event] = await this.L1MessageService.queryFilter(
        this.L1MessageService.filters.DataFinalized(index)
      );
      if (!(event instanceof EventLog)) {
        throw new Error('no DataFinalized event');
      }
      prevStateRoot = event.args.startingRootHash;
      stateRoot = event.args.finalRootHash;
    }
    const prover = new LineaProver(this.provider2, index);
    prover.stateRoot = stateRoot;
    return { index, startIndex, stateRoot, prevStateRoot, prover };
  }
  override encodeWitness(
    commit: LineaCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256, bytes[], bytes)'],
      [[commit.index, proofSeq.proofs, proofSeq.order]]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // https://docs.linea.build/developers/guides/bridge/how-to-bridge-eth#bridge-eth-from-linea-mainnet-l2-to-ethereum-mainnet-l1
    // "Reminder: It takes at least 8 hours for the transaction to go through from L2 to L1."
    // 20240815: heuristic based on mainnet data
    // https://etherscan.io/advanced-filter?tadd=0x1335f1a2b3ff25f07f5fef07dd35d8fb4312c3c73b138e2fad9347b3319ab53c&ps=25&eladd=0xd19d4B5d358258f05D7B411E21A1460D11B0876F&eltpc=0x1335f1a2b3ff25f07f5fef07dd35d8fb4312c3c73b138e2fad9347b3319ab53c
    const blocksPerCommit = 5000; // every 2000-8000+ L2 blocks
    const secPerCommit = 2 * 3600; // every ~2 hours
    return blocksPerCommit * Math.ceil(sec / secPerCommit); // units of commit
  }
}
