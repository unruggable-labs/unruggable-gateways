import type { AbiParameterToPrimitiveType } from 'abitype';
import { encodeAbiParameters, parseAbiParameter, toHex, zeroHash } from 'viem';
import { getBlock, getProof } from 'viem/actions';
import { CachedMap } from '../cached.js';
import { EthProver } from '../eth/EthProver.js';
import { AbstractRollupV1, type RollupCommit } from '../rollup.js';
import type { EncodedProof, HexAddress, HexString } from '../types.js';

const OutputRootProofType = parseAbiParameter(
  '(bytes32 version, bytes32 stateRoot, bytes32 messagePasserStorageRoot, bytes32 latestBlockhash)'
);

export type OPCommit = RollupCommit<EthProver> & {
  readonly blockHash: HexString;
  readonly stateRoot: HexString;
  readonly passerRoot: HexString;
};

function outputRootProofTuple(
  commit: OPCommit
): AbiParameterToPrimitiveType<typeof OutputRootProofType> {
  return {
    version: zeroHash,
    stateRoot: commit.stateRoot,
    messagePasserStorageRoot: commit.passerRoot,
    latestBlockhash: commit.blockHash,
  };
}

export abstract class AbstractOPRollup extends AbstractRollupV1<OPCommit> {
  l2ToL1MessagePasserAddress: HexAddress =
    '0x4200000000000000000000000000000000000016';
  async createCommit(index: bigint, blockNumber: bigint): Promise<OPCommit> {
    const [{ storageHash: passerRoot }, { stateRoot, hash: blockHash }] =
      await Promise.all([
        getProof(this.client2, {
          address: this.l2ToL1MessagePasserAddress,
          storageKeys: [],
          blockNumber,
        }),
        getBlock(this.client2, { blockNumber, includeTransactions: false }),
      ]);
    return {
      index,
      blockHash,
      stateRoot,
      passerRoot,
      prover: new EthProver(
        this.client2,
        blockNumber,
        new CachedMap(Infinity, this.commitCacheSize)
      ),
    };
  }
  override encodeWitness(
    commit: OPCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return encodeAbiParameters(
      [
        { type: 'uint256' },
        OutputRootProofType,
        { type: 'bytes[]' },
        { type: 'bytes' },
      ],
      [commit.index, outputRootProofTuple(commit), proofs, toHex(order)]
    );
  }
  override encodeWitnessV1(
    commit: OPCommit,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ): HexString {
    return encodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [{ type: 'uint256' }, OutputRootProofType],
        },
        { type: 'tuple', components: [{ type: 'bytes' }, { type: 'bytes[]' }] },
      ],
      [
        [commit.index, outputRootProofTuple(commit)],
        [accountProof, storageProofs],
      ]
    );
  }
}
