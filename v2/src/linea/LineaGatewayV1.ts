import { LineaCommit, LineaRollup } from './LineaRollup.js';
import { isExistanceProof, LineaProof, LineaProofExistance } from './types.js';
import { GatewayV1 } from '../gateway.js';
import { EVMRequestV1 } from '../v1.js';
import { ABI_CODER } from '../utils.js';
import { requireV1Needs } from '../vm.js';

// https://github.com/Consensys/linea-ens/blob/main/packages/linea-ccip-gateway/src/L2ProofService.ts

// the deployed linea verifier is not compatible with the current gateway design
// 1. v0 request encoding (no OP_ADD_CONST)
// 2. strange proof encoding: incorrect negative proofs + unnecessary data (key)

export class LineaGatewayV1 extends GatewayV1<LineaRollup> {
  override async handleRequest(commit: LineaCommit, request: EVMRequestV1) {
    const state = await commit.prover.evalRequest(request.v2());
    const { target, slots } = requireV1Needs(state.needs);
    const proofs = await commit.prover.getProofs(target, slots);
    if (!isExistanceProof(proofs.accountProof)) {
      throw new Error(`not a contract: ${request.target}`);
    }
    const witness = ABI_CODER.encode(
      [
        'uint256',
        'tuple(address, uint256, tuple(bytes, bytes[]))',
        'tuple(bytes32, uint256, tuple(bytes32, bytes[]), bool)[]',
      ],
      [
        commit.index,
        encodeAccountProof(proofs.accountProof),
        proofs.storageProofs.map(encodeStorageProof),
      ]
    );
    return ABI_CODER.encode(['bytes'], [witness]);
  }
}

function encodeAccountProof(proof: LineaProofExistance) {
  return [
    proof.key,
    proof.leafIndex,
    [proof.proof.value, proof.proof.proofRelatedNodes],
  ];
}

function encodeStorageProof(proof: LineaProof) {
  return isExistanceProof(proof)
    ? [
        proof.key,
        proof.leafIndex,
        [proof.proof.value, proof.proof.proofRelatedNodes],
        true,
      ]
    : [
        proof.key,
        proof.leftLeafIndex,
        [proof.leftProof.value, proof.leftProof.proofRelatedNodes],
        false,
      ];
}