import type { BigNumberish, HexString } from './types.js';
import type { RPCEthGetBlock } from './eth/types.js';
import { encodeRlp, type RlpStructuredDataish } from 'ethers/utils';

// https://ethereum.github.io/execution-specs/src/ethereum/rlp.py.html

export function encodeRlpUint(
  x: BigNumberish | undefined | null
): HexString | undefined {
  if (x === undefined || x === null) return;
  const s = BigInt(x).toString(16);
  return s === '0' ? '0x' : s.length & 1 ? `0x0${s}` : `0x${s}`;
  // same as: return hexlify(toBeArray(x));
}

export function encodeRlpOptionalList(
  v: (RlpStructuredDataish | undefined)[]
): HexString {
  return encodeRlp(
    v.slice(0, 1 + v.findLastIndex((x) => x)).map((x) => x || '0x')
  );
}

export function encodeRlpBlock(block: RPCEthGetBlock): HexString {
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
    // optional
    encodeRlpUint(block.baseFeePerGas),
    block.withdrawalsRoot,
    encodeRlpUint(block.blobGasUsed),
    encodeRlpUint(block.excessBlobGas),
    block.parentBeaconBlockRoot,
    block.requestsHash,
  ]);
}
