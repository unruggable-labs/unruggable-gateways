import { ZeroHash } from 'ethers/constants';
import type {
  EncodedProof,
  HexAddress,
  HexString,
  HexString32,
} from '../types.js';
import { ABI_CODER, NULL_CODE_HASH } from '../utils.js';

export type EthProof = HexString[];

export type EthStorageProof = {
  key: HexString;
  value: HexString;
  proof: EthProof;
};

export type RPCEthGetProof = {
  address: HexAddress;
  balance: HexString;
  codeHash?: HexString32;
  keccakCodeHash?: HexString32; // scroll reeee
  nonce: HexString;
  accountProof: EthProof;
  storageHash: HexString32;
  storageProof: EthStorageProof[];
};

export type EthAccountProof = Omit<RPCEthGetProof, 'storageProof'>;

export type RPCEthGetBlock<TransactionT = HexString> = {
  hash: HexString32;
  stateRoot: HexString32;
  parentHash: HexString32;
  sha3Uncles: HexString32;
  miner: HexAddress;
  transactionsRoot: HexString32;
  receiptsRoot: HexString32;
  logsBloom: HexString;
  difficulty: HexString;
  number: HexString;
  gasLimit: HexString;
  gasUsed: HexString;
  extraData: HexString;
  mixHash: HexString32; // prev_randao
  nonce: HexString;
  transactions: TransactionT[];
  timestamp: HexString;
  uncles: HexString[];
  // optional
  baseFeePerGas?: HexString;
  withdrawals?: HexString[];
  withdrawalsRoot?: HexString32;
  blobGasUsed?: HexString;
  excessBlobGas?: HexString;
  parentBeaconBlockRoot?: HexString32;
  requestsHash?: HexString32;
};

export function isContract(proof: EthAccountProof) {
  const codeHash = proof.keccakCodeHash ?? proof.codeHash;
  const eoa = codeHash === NULL_CODE_HASH;
  const dne = codeHash === ZeroHash;
  return !eoa && !dne;
}

export function encodeProof(proof: EthProof): EncodedProof {
  return ABI_CODER.encode(['bytes[]'], [proof]);
}
