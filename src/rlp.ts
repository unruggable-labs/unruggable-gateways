import type { BigNumberish, BytesLike, HexString } from './types.js';
import type { RPCEthGetBlock } from './eth/types.js';
import {
  encodeRlp,
  getBytes,
  hexlify,
  RlpStructuredData,
  type RlpStructuredDataish,
} from 'ethers/utils';
import { toPaddedHex } from './utils.js';

// block header:
// https://ethereum.github.io/execution-specs/src/ethereum/cancun/blocks.py.html#ethereum.cancun.blocks.Header:0
// https://github.com/taikoxyz/taiko-geth/blob/30a615b4c3aafd0d395309035d58b86ff53c8eb0/core/types/block.go#L65
// https://github.com/ethereum/go-ethereum/blob/80bdab757dfb0f6d73fb869d834979536fe474e5/core/types/block.go#L75-L109
// pectra: https://eips.ethereum.org/EIPS/eip-7685

// rlp encoding:
// https://github.com/ethereum/ethereum-rlp/blob/master/src/ethereum_rlp/rlp.py

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

function unarrayifyInteger(data, offset, length) {
  let result = 0;
  for (let i = 0; i < length; i++) {
    result = result * 256 + data[offset + i];
  }
  return result;
}

type Decoded = {
  consumed: number;
  result: RlpStructuredData;
};

function _decodeChildren(
  data: Uint8Array,
  offset: number,
  childOffset: number,
  length: number
): Decoded {
  const result: RlpStructuredData = [];
  while (childOffset < offset + 1 + length) {
    const decoded = _decode(data, childOffset);
    result.push(decoded.result);
    childOffset += decoded.consumed;
  }
  return { consumed: 1 + length, result };
}

function _decode(data: Uint8Array, offset: number): Decoded {
  function checkOffset(off: number) {
    if (off > data.length) throw new Error('overflow');
  }
  checkOffset(offset);
  // Array with extra length prefix
  if (data[offset] >= 0xf8) {
    const lengthLength = data[offset] - 0xf7;
    checkOffset(offset + 1 + lengthLength);
    const length = unarrayifyInteger(data, offset + 1, lengthLength);
    checkOffset(offset + 1 + lengthLength + length);
    return _decodeChildren(
      data,
      offset,
      offset + 1 + lengthLength,
      lengthLength + length
    );
  } else if (data[offset] >= 0xc0) {
    const length = data[offset] - 0xc0;
    checkOffset(offset + 1 + length);
    return _decodeChildren(data, offset, offset + 1, length);
  } else if (data[offset] >= 0xb8) {
    const lengthLength = data[offset] - 0xb7;
    checkOffset(offset + 1 + lengthLength);
    const length = unarrayifyInteger(data, offset + 1, lengthLength);
    checkOffset(offset + 1 + lengthLength + length);
    const result = hexlify(
      data.slice(offset + 1 + lengthLength, offset + 1 + lengthLength + length)
    );
    return { consumed: 1 + lengthLength + length, result: result };
  } else if (data[offset] >= 0x80) {
    const length = data[offset] - 0x80;
    checkOffset(offset + 1 + length);
    const result = hexlify(data.slice(offset + 1, offset + 1 + length));
    return { consumed: 1 + length, result: result };
  }
  return { consumed: 1, result: toPaddedHex(data[offset], 1) };
}

export function decodeRlp(data: BytesLike): RlpStructuredData {
  return _decode(getBytes(data), 0).result;
}
