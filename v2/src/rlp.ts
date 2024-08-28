import { toRlp } from 'viem';
import type { RpcBlock } from './eth/types.js';
import type { HexString, RecursiveArray } from './types.js';

// https://ethereum.github.io/execution-specs/src/ethereum/rlp.py.html

export function encodeRlpUint(
  x?: HexString | null
): HexString | undefined | null {
  if (x === undefined || x === null) return x;
  const s = BigInt(x).toString(16);
  return s === '0' ? '0x' : s.length & 1 ? `0x0${s}` : `0x${s}`;
}

export function encodeRlpOptionalList(
  v: (RecursiveArray<HexString> | undefined | null)[]
): HexString {
  return toRlp(v.slice(0, 1 + v.findLastIndex((x) => x)).map((x) => x || '0x'));
}

export function encodeRlpBlock(block: RpcBlock): HexString {
  return encodeRlpOptionalList([
    block.parentHash,
    block.sha3Uncles,
    block.miner,
    block.stateRoot,
    block.transactionsRoot,
    block.receiptsRoot,
    block.logsBloom,
    encodeRlpUint(block.difficulty),
    encodeRlpUint(block.number),
    encodeRlpUint(block.gasLimit),
    encodeRlpUint(block.gasUsed),
    encodeRlpUint(block.timestamp),
    block.extraData,
    block.mixHash,
    block.nonce,
    encodeRlpUint(block.baseFeePerGas),
    block.withdrawalsRoot,
    encodeRlpUint(block.blobGasUsed),
    encodeRlpUint(block.excessBlobGas),
    block.parentBeaconBlockRoot,
  ]);
}
