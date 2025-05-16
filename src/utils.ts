import { AbiCoder } from 'ethers/abi';
import { id as keccakStr } from 'ethers/hash';
import type { CallExceptionError, EthersError } from 'ethers/utils';
import type {
  Provider,
  BigNumberish,
  HexString,
  HexString32,
  HexAddress,
} from './types.js';
import type { RPCEthGetBlock } from './eth/types.js';

export const ABI_CODER = AbiCoder.defaultAbiCoder();

// https://adraffy.github.io/keccak.js/test/demo.html#algo=keccak-256&s=&escape=1&encoding=utf8
// "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
export const NULL_CODE_HASH = keccakStr('');

export const EVM_BLOCKHASH_DEPTH = 256;

// TODO: make this a function of Chain
export const MAINNET_BLOCK_SEC = 12;

export const LATEST_BLOCK_TAG = 'latest';

// hex-prefixed w/o zero-padding
export function toUnpaddedHex(x: BigNumberish | boolean): HexString {
  return '0x' + BigInt(x).toString(16);
}
// hex-prefixed left-pad w/truncation
export function toPaddedHex(x: BigNumberish | boolean, width = 32) {
  const i = x === '0x' ? 0n : BigInt.asUintN(width << 3, BigInt(x));
  return '0x' + i.toString(16).padStart(width << 1, '0');
}

export function dataViewFrom(v: Uint8Array) {
  return new DataView(v.buffer, v.byteOffset, v.byteLength);
}

// manual polyfill: ES2024
export function withResolvers<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((ful, rej) => {
    resolve = ful;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function isBlockTag(x: BigNumberish): x is string {
  return typeof x === 'string' && !x.startsWith('0x');
}

export async function fetchBlock<tx extends boolean = false>(
  provider: Provider,
  relBlockTag: BigNumberish = LATEST_BLOCK_TAG,
  includeTx?: tx | false
): Promise<RPCEthGetBlock<tx>> {
  if (!isBlockTag(relBlockTag)) {
    let i = BigInt(relBlockTag);
    if (i < 0) i += await fetchBlockNumber(provider);
    relBlockTag = toUnpaddedHex(i);
  }
  const tx = includeTx ?? false;
  const json = await provider.send('eth_getBlockByNumber', [relBlockTag, tx]);
  if (!json) throw new Error(`no block: ${relBlockTag}`);
  return json as RPCEthGetBlock<tx>;
}

export async function fetchBlockFromHash(
  provider: Provider,
  blockHash: HexString32
): Promise<RPCEthGetBlock> {
  const block: RPCEthGetBlock | null = await provider.send(
    'eth_getBlockByHash',
    [blockHash, false]
  );
  if (!block) throw new Error(`no blockhash: ${blockHash}`);
  return block;
}

// avoid an rpc if possible
// use negative (-100) for offset from "latest" (#-100)
export async function fetchBlockNumber(
  provider: Provider,
  relBlockTag: BigNumberish = LATEST_BLOCK_TAG
): Promise<bigint> {
  if (relBlockTag === LATEST_BLOCK_TAG) {
    return BigInt(await provider.send('eth_blockNumber', []));
  } else if (isBlockTag(relBlockTag)) {
    const info = await fetchBlock(provider, relBlockTag);
    return BigInt(info.number);
  } else {
    let i = BigInt(relBlockTag);
    if (i < 0) i += await fetchBlockNumber(provider);
    return i;
  }
}

// avoid an rpc if possible
// convert negative (-100) => absolute (#-100)
export async function fetchBlockTag(
  provider: Provider,
  relBlockTag: BigNumberish = LATEST_BLOCK_TAG
): Promise<string | bigint> {
  return isBlockTag(relBlockTag)
    ? relBlockTag
    : fetchBlockNumber(provider, relBlockTag);
}

export async function fetchStorage(
  provider: Provider,
  target: HexAddress,
  slot: BigNumberish,
  relBlockTag: BigNumberish = LATEST_BLOCK_TAG
): Promise<HexString32> {
  const data: HexString32 | null = await provider.send('eth_getStorageAt', [
    target,
    toPaddedHex(slot),
    relBlockTag,
  ]);
  if (!data) {
    throw new Error(
      `expected storage: ${target}<${toUnpaddedHex(slot)}>@${relBlockTag}`
    );
  }
  // i think i've seen "0x" before...
  return data.length === 66 ? data : toPaddedHex(data);
}

export function isEthersError(err: unknown): err is EthersError {
  return err instanceof Error && 'code' in err && 'shortMessage' in err;
}

export function isRevert(err: unknown): err is CallExceptionError {
  return isEthersError(err) && err.code === 'CALL_EXCEPTION';
}

export function isRPCError(err: unknown, code: number): err is EthersError {
  return (
    isEthersError(err) &&
    err.error instanceof Object &&
    'code' in err.error &&
    err.error.code === code
  );
}

export function flattenErrors(err: unknown, stringify = stringifyError) {
  const errors = [stringify(err)];
  for (let e = err; e instanceof Error && e.cause; e = e.cause) {
    errors.push(stringify(e.cause));
  }
  return errors.join(' <== ');
}

function stringifyError(err: unknown) {
  if (isEthersError(err) && err.code === 'SERVER_ERROR') {
    // this leaks api key via "requestUrl"
    // https://github.com/ethers-io/ethers.js/blob/d2c9ca0e0fd15e7884bcaab7d5152d68662e3e43/src.ts/utils/fetch.ts#L953
    return err.shortMessage;
  } else {
    return String(err);
  }
}
