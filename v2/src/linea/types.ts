import type { Address } from 'viem';
import type { linea, lineaSepolia } from 'viem/chains';
import type { ClientWithCustomRpc, HexString, HexString32 } from '../types.js';

export type LineaProofObject = {
  proofRelatedNodes: HexString[];
  value: HexString;
};

export type LineaProofAbsence = {
  key: HexString32;
  leftLeafIndex: number;
  leftProof: LineaProofObject;
  rightLeafIndex: number;
  rightProof: LineaProofObject;
};

export type LineaProofExistance = {
  key: HexString32;
  leafIndex: number;
  proof: LineaProofObject;
};

export type LineaProof = LineaProofAbsence | LineaProofExistance;

export type RPCLineaGetProof = {
  accountProof: LineaProof;
  storageProofs: LineaProof[]; // note: this is plural
};

export type LineaClient = ClientWithCustomRpc<
  [
    {
      Method: 'linea_getProof';
      Parameters: [
        address: Address,
        keys: HexString32[],
        blockNumber: HexString,
      ];
      ReturnType: RPCLineaGetProof;
    },
  ],
  typeof linea | typeof lineaSepolia
>;
