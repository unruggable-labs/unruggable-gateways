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

export type RPCEthTransaction = {
  type: HexString;
  chainId: HexString;
  nonce: HexString;
  gasPrice: HexString;
  to: HexAddress;
  from: HexAddress;
  gas: HexString;
  value: HexString;
  input: HexString;
  r: HexString32;
  s: HexString32;
  v: HexString;
  hash: HexString32;
  blockHash: HexString32;
  blockNumber: HexString;
  transactionIndex: HexString;
};

export function isEIP4844(tx: RPCEthTransaction): tx is RPCEthTransaction4844 {
  return tx.type === '0x3';
}

export type RPCEthTransaction4844 = RPCEthTransaction & {
  blobVersionedHashes: HexString32[];
};

export type RPCEthGetBlock<tx extends boolean = false> = {
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
  transactions: (tx extends true ? RPCEthTransaction : HexString32)[];
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
  return (
    proof.codeHash !== NULL_CODE_HASH && proof.keccakCodeHash !== NULL_CODE_HASH
  );
}

export function encodeProof(proof: EthProof): EncodedProof {
  return ABI_CODER.encode(['bytes[]'], [proof]);
}
