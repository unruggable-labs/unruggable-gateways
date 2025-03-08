import { type RollupCommit, AbstractRollup } from '../rollup.js';
import type {
  HexString,
  HexString32,
  ProofSequence,
  ProviderPair,
} from '../types.js';
import { keccak256 } from 'ethers/crypto';
import { Contract } from 'ethers/contract';
import { LineaProver } from './LineaProver.js';
import { ROLLUP_ABI } from './types.js';
import { ABI_CODER, fetchBlock, MAINNET_BLOCK_SEC } from '../utils.js';
import type { LineaConfig } from './LineaRollup.js';

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
    super(providers);
    this.L1MessageService = new Contract(
      config.L1MessageService,
      ROLLUP_ABI,
      this.provider1
    );
  }

  // WARNING: this doesn't work because the stateRoots are sparse merkle
  // and the block stateRoots are merkle-patricia

  // requirements for operation:
  // 1. shomei node with unfinalized proof generation
  // 2. shomei stateRoot to l2Block indexer

  // this is likely too inefficient and requires external stateRoot => blockHash indexer

  // async findL2BlockBefore(beforeTimestamp: number) {
  //   const step = 1000;
  //   let block = await fetchBlock(this.provider2);
  //   while (block && parseInt(block.timestamp) > beforeTimestamp) {
  //     console.log(parseInt(block.number), block.hash);
  //     block = await fetchBlock(this.provider2, parseInt(block.number) - step);
  //   }
  //   if (!block) throw new Error(`expected block before: ${beforeTimestamp}`);
  //   return parseInt(block.number) + step - 1;
  // }

  // async findL2BlockWithStateRoot(
  //   beforeTimestamp: number,
  //   stateRoot: HexString32
  // ) {
  //   const step = 100;
  //   for (
  //     let i = await this.findL2BlockBefore(beforeTimestamp);
  //     i >= 0;
  //     i -= step
  //   ) {
  //     const start = Math.max(0, i - step);
  //     const blocks = await Promise.all(
  //       Array.from({ length: i - start }, (_, i) =>
  //         fetchBlock(this.provider2, start + i)
  //       )
  //     );
  //     console.log(start, i);
  //     const block = blocks.find((x) => x.stateRoot === stateRoot);
  //     if (block) return BigInt(block.number);
  //   }
  //   throw new Error(`unable to find block with stateRoot: ${stateRoot}`);
  // }

  override get unfinalized() {
    return true;
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    const l1BlockInfo = await fetchBlock(this.provider1, this.latestBlockTag);
    const l1BlockNumber = parseInt(l1BlockInfo.number) - this.minAgeBlocks;
    const step = this.getLogsStepSize;
    for (let i = l1BlockNumber; i >= 0; i -= step) {
      const logs = await this.L1MessageService.queryFilter(
        this.L1MessageService.filters.DataSubmittedV3(),
        i < step ? 0 : i + 1 - step,
        i
      );
      if (logs.length) return BigInt(logs[logs.length - 1].blockNumber);
    }
    throw new Error(`no earlier shnarf: ${l1BlockNumber}`);
  }
  protected override async _fetchParentCommitIndex(
    commit: UnfinalizedLineaCommit
  ): Promise<bigint> {
    const [event] = await this.L1MessageService.queryFilter(
      this.L1MessageService.filters.DataSubmittedV3(null, commit.parentShnarf)
    );
    return event ? BigInt(event.blockNumber) : -1n;
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
    if (!desc) throw new Error(`unable to parse tx`);
    // const block = await fetchBlock(this.provider1, tx.blockNumber);
    // if (!block) throw new Error(`expected block: ${tx.blockNumber}`);
    type ABIBlobData = {
      dataEvaluationClaim: bigint;
      kzgCommitment: HexString;
      kzgProof: HexString;
      finalStateRootHash: HexString32;
      snarkHash: HexString32;
    };
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
    throw new Error(`block number from shnarf not implemented`);
    return {
      index,
      prover: new LineaProver(this.provider2, 0),
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
