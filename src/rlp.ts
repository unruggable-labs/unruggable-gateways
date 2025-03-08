import type { BigNumberish, HexString } from './types.js';
import type { RPCEthGetBlock } from './eth/types.js';
import { encodeRlp, type RlpStructuredDataish } from 'ethers/utils';

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
