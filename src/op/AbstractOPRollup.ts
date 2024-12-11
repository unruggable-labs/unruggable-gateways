import type {
  HexString,
  BigNumberish,
  ProofSequence,
  ProofSequenceV1,
  HexString32,
} from '../types.js';
import {
  AbstractRollup,
  type RollupCommit,
  type RollupWitnessV1,
} from '../rollup.js';
import { EthProver } from '../eth/EthProver.js';
import { ZeroHash } from 'ethers/constants';
import { keccak256 } from 'ethers/crypto';
import { ABI_CODER } from '../utils.js';

const OutputRootProofType = `(
  bytes32 version,
  bytes32 stateRoot,
  bytes32 messagePasserStorageRoot,
  bytes32 latestBlockhash
)`;

function outputRootProofTuple(commit: OPCommit) {
  return [ZeroHash, commit.stateRoot, commit.passerRoot, commit.blockHash];
}

// same as lib/optimism/packages/contract-bedrock/src/libraries/Hashing.sol
export function hashOutputRootProof(commit: OPCommit): HexString32 {
  return keccak256(
    ABI_CODER.encode([OutputRootProofType], [outputRootProofTuple(commit)])
  );
}

export type OPCommit = RollupCommit<EthProver> & {
  readonly blockHash: HexString;
  readonly stateRoot: HexString;
  readonly passerRoot: HexString;
};

const L2ToL1MessagePasser = '0x4200000000000000000000000000000000000016';

export abstract class AbstractOPRollup
  extends AbstractRollup<OPCommit>
  implements RollupWitnessV1<OPCommit>
{
  L2ToL1MessagePasser = L2ToL1MessagePasser;
  async createCommit(index: bigint, block: BigNumberish): Promise<OPCommit> {
    const prover = new EthProver(this.provider2, block);
    const [{ storageHash: passerRoot }, blockInfo] = await Promise.all([
      prover.fetchProofs(this.L2ToL1MessagePasser),
      prover.fetchBlock(),
    ]);
    return {
      index,
      blockHash: blockInfo.hash,
      stateRoot: blockInfo.stateRoot,
      passerRoot,
      prover,
    };
  }
  override encodeWitness(commit: OPCommit, proofSeq: ProofSequence) {
    return ABI_CODER.encode(
      [`(uint256, ${OutputRootProofType}, bytes[], bytes)`],
      [
        [
          commit.index,
          outputRootProofTuple(commit),
          proofSeq.proofs,
          proofSeq.order,
        ],
      ]
    );
  }
  encodeWitnessV1(commit: OPCommit, proofSeq: ProofSequenceV1) {
    return ABI_CODER.encode(
      [`(uint256, ${OutputRootProofType})`, 'tuple(bytes, bytes[])'],
      [
        [commit.index, outputRootProofTuple(commit)],
        [proofSeq.accountProof, proofSeq.storageProofs],
      ]
    );
  }
}
