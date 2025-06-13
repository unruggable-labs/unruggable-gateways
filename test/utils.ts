import type { BytesLike, HexString } from '../src/types.js';
import { getBytes, hexlify, toBigInt, toUtf8Bytes } from 'ethers/utils';

// convenience to decode a single ABI type
// export function decodeType(type: string, data: BytesLike) {
// 	return ethers.AbiCoder.defaultAbiCoder().decode([type], data)[0];
// }

export function decodeStorageArray(step: number, data: BytesLike): HexString[] {
  if (!Number.isInteger(step) || step < 1)
    throw new Error(`invalid step: ${step}`);
  const v = getBytes(data);
  const n = Number(toBigInt(v.subarray(0, 32)));
  if (step < 32) {
    const per = (32 / step) | 0;
    return Array.from({ length: n }, (_, i) => {
      const x = 64 + ((i / per) << 5) - (i % per) * step;
      return hexlify(v.subarray(x - step, x));
    });
  } else {
    const per = (step + 31) >> 5; // number of slots spanned
    return Array.from({ length: n }, (_, i) => {
      const x = (1 + i * per) << 5;
      return hexlify(v.subarray(x, x + step));
    });
  }
}

export function encodeShortString(s: string): HexString {
  const v = toUtf8Bytes(s);
  if (v.length > 31) throw new Error('too big');
  const u = new Uint8Array(32);
  u.set(v);
  u[31] = v.length << 1;
  return hexlify(u);
}
