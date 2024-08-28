import { bytesToBigInt, keccak256, toBytes, toHex, type Hex } from 'viem';
import type { HexString } from '../src/types.js';

// convenience to decode a single ABI type
// export function decodeType(type: string, data: BytesLike) {
// 	return ethers.AbiCoder.defaultAbiCoder().decode([type], data)[0];
// }

export function decodeStorageArray(step: number, data: Hex): HexString[] {
  if (!Number.isInteger(step) || step < 1)
    throw new Error(`invalid step: ${step}`);
  const v = toBytes(data);
  const n = Number(bytesToBigInt(v.subarray(0, 32)));
  if (step < 32) {
    const per = (32 / step) | 0;
    return Array.from({ length: n }, (_, i) => {
      const x = 64 + ((i / per) << 5) - (i % per) * step;
      return toHex(v.subarray(x - step, x));
    });
  } else {
    const per = (step + 31) >> 5; // number of slots spanned
    return Array.from({ length: n }, (_, i) => {
      const x = (1 + i * per) << 5;
      return toHex(v.subarray(x, x + step));
    });
  }
}

export const id = (x: string) => keccak256(toHex(x));
