import type { GetProofReturnType, RpcBlock as RpcBlock_ } from 'viem';
import type { HexString, HexString32 } from '../types.js';

export type RpcProof = GetProofReturnType & {
  keccakCodeHash?: HexString32; // scroll reeee
};

export type EthAccountProof = Omit<RpcProof, 'storageProof'>;
export type EthStorageProof = RpcProof['storageProof'][0];
export type EthProof = HexString[];

export type RpcBlock = RpcBlock_<'finalized', false> & {
  parentBeaconBlockRoot?: HexString32;
};

// without transaction detail
// https://ethereum.github.io/execution-specs/src/ethereum/cancun/blocks.py.html#ethereum.cancun.blocks.Header
// https://github.com/taikoxyz/taiko-geth/blob/30a615b4c3aafd0d395309035d58b86ff53c8eb0/core/types/block.go#L65
// export type RPCEthGetBlock<TransactionT = HexString> = {
//   hash: HexString32;
//   stateRoot: HexString32;
//   parentHash: HexString32;
//   sha3Uncles: HexString32;
//   miner: HexAddress;
//   transactionsRoot: HexString32;
//   receiptsRoot: HexString32;
//   logsBloom: HexString;
//   difficulty: HexString;
//   number: HexString;
//   gasLimit: HexString;
//   gasUsed: HexString;
//   extraData: HexString;
//   mixHash: HexString32; // prev_randao
//   nonce: HexString;
//   transactions: TransactionT[];
//   timestamp: HexString;
//   uncles: HexString[];
//   // optional
//   baseFeePerGas?: HexString;
//   withdrawals?: HexString[];
//   withdrawalsRoot?: HexString32;
//   blobGasUsed?: HexString;
//   excessBlobGas?: HexString;
//   parentBeaconBlockRoot?: HexString32;
// };
