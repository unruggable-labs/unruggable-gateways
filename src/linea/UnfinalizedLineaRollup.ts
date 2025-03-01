import { type RollupCommit, AbstractRollup } from '../rollup.js';
import type {
  HexString,
  HexString32,
  ProofSequence,
  ProviderPair,
} from '../types.js';
import { keccak256 } from 'ethers/crypto';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { LineaProver } from './LineaProver.js';
import { ABI_CODER, fetchBlock, MAINNET_BLOCK_SEC } from '../utils.js';
import type { LineaConfig } from './LineaRollup.js';

// https://github.com/Consensys/linea-monorepo/blob/main/contracts/src/rollup/LineaRollup.sol
const ROLLUP_ABI = new Interface([
  `event DataSubmittedV3(
    bytes32 parentShnarf,
    bytes32 indexed shnarf,
    bytes32 finalStateRootHash
  )`,
  `function submitBlobs(
    (
      uint256 dataEvaluationClaim,
      bytes kzgCommitment,
      bytes kzgProof,
      bytes32 finalStateRootHash,
      bytes32 snarkHash
    )[] blobSubmissionData,
    bytes32 parentShnarf,
    bytes32 finalBlobShnarf
  ) external`,
]);

type ABIBlobData = {
  dataEvaluationClaim: bigint;
  kzgCommitment: HexString;
  kzgProof: HexString;
  finalStateRootHash: HexString32;
  snarkHash: HexString32;
};

// const ROLLUP_ABI_OLD = new Interface([
//   `event DataSubmittedV2(
//     bytes32 indexed shnarf,
//     uint256 indexed startBlock,
//     uint256 indexed endBlock
//   )`,
//   `function submitBlobs(
//     (
//       (
//         bytes32 finalStateRootHash,
//         uint256 firstBlockInData,
//         uint256 finalBlockInData,
//         bytes32 snarkHash
//       ) submissionData,
//       uint256 dataEvaluationClaim,
//       bytes kzgCommitment,
//       bytes kzgProof
//     )[] blobSubmissionData,
//     bytes32 parentShnarf,
//     bytes32 finalBlobShnarf
//   ) external`,
// ]);

// type ABIBlobData = {
// 	submissionData: {
// 	  finalStateRootHash: HexString32;
// 	  firstBlockInData: bigint;
// 	  finalBlockInData: bigint;
// 	  snarkHash: HexString32;
// 	};
// 	dataEvaluationClaim: bigint;
// 	kzgCommitment: HexString;
// 	kzgProof: HexString;
//   };

export type UnfinalizedLineaCommit = RollupCommit<LineaProver> & {
  readonly abiEncodedTuple: HexString;
  readonly parentShnarf: HexString32;
};

export class UnfinalizedLineaRollup extends AbstractRollup<UnfinalizedLineaCommit> {
  readonly L1MessageService: Contract;
  constructor(
    providers: ProviderPair,
    config: LineaConfig,
    readonly minAgeBlocks: number
  ) {
    if (!config.firstCommitV3) throw new Error('expected V3');
    super(providers);
    this.L1MessageService = new Contract(
      config.L1MessageService,
      ROLLUP_ABI,
      this.provider1
    );
  }

  override get unfinalized() {
    return true;
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    const l1BlockInfo = await fetchBlock(this.provider1, this.latestBlockTag);
    const l1BlockNumber = parseInt(l1BlockInfo.number) - this.minAgeBlocks;
    const step = this.getLogsStepSize;
    for (let i = l1BlockNumber; i >= 0; i -= step) {
      const logs = await this.provider1.getLogs({
        address: this.L1MessageService.target,
        topics: [
          this.L1MessageService.filters.DataSubmittedV3.fragment.topicHash,
        ],
        fromBlock: i < step ? 0 : i + 1 - step,
        toBlock: i,
      });
      if (logs.length) return BigInt(logs[logs.length - 1].blockNumber);
      //return BigInt(logs[logs.length - 1].topics[3]); // end block
    }
    throw new Error(`no earlier shnarf: ${l1BlockNumber}`);
  }
  protected override async _fetchParentCommitIndex(
    commit: UnfinalizedLineaCommit
  ): Promise<bigint> {
    const [event] = await this.L1MessageService.queryFilter(
      this.L1MessageService.filters.DataSubmittedV3(null, commit.parentShnarf)
    );
    if (!event) throw new Error(`no earlier shnarf: ${commit.index}`);
    return BigInt(event.blockNumber);
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<UnfinalizedLineaCommit> {
    const [event] = await this.L1MessageService.queryFilter(
      this.L1MessageService.filters.DataSubmittedV3(),
      index,
      index
    );
    if (!event) throw new Error(`no DataSubmittedV3`);
    const tx = await event.getTransaction();
    if (!tx || !tx.blockNumber || !tx.blobVersionedHashes) {
      throw new Error(`no submit tx: ${event.transactionHash}`);
    }
    const desc = this.L1MessageService.interface.parseTransaction(tx);
    if (!desc) throw new Error(`unable to parse tx: ${tx.hash}`);
    const blobs = desc.args.blobSubmissionData as ABIBlobData[];
    if (!blobs.length) throw new Error('expected blobs');
    const parentShnarf = desc.args.parentShnarf as HexString32;
    let computedShnarf = parentShnarf;
    let abiEncodedTuple!: HexString;
    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      const currentDataEvaluationPoint = keccak256(
        ABI_CODER.encode(
          ['bytes32', 'bytes32'],
          [blob.snarkHash, tx.blobVersionedHashes[i]]
        )
      );
      abiEncodedTuple = ABI_CODER.encode(
        ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint256'],
        [
          computedShnarf,
          blob.snarkHash,
          blob.finalStateRootHash,
          currentDataEvaluationPoint,
          blob.dataEvaluationClaim,
        ]
      );
      computedShnarf = keccak256(abiEncodedTuple);
    }
    if (computedShnarf !== desc.args.finalBlobShnarf) {
      throw new Error('shnarf mismatch');
    }
    // TODO: the V3 design removed finalBlockInData
    // i think this requires parsing l2BlockNumber from the blob data
    // blobVersionedHash => blob function doesn't exist yet
    // https://github.com/ethereum/beacon-APIs/issues/332
    throw new Error('NOT IMPLEMENTED');
    const l2BlockNumber = 0;
    const prover = new LineaProver(this.provider2, l2BlockNumber);
    //prover.shomeiProvider = this._shomeiProvider;
    return {
      index,
      prover,
      abiEncodedTuple,
      parentShnarf,
    };
  }

  override encodeWitness(
    commit: UnfinalizedLineaCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256, bytes, bytes[], bytes)'],
      [[commit.index, commit.abiEncodedTuple, proofSeq.proofs, proofSeq.order]]
    );
  }

  override windowFromSec(sec: number): number {
    return Math.ceil(sec / MAINNET_BLOCK_SEC); // units of L1Block
  }
}
