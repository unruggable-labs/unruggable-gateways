import type { Chain, Client, RpcSchema, Transport } from 'viem';

export type HexString = `0x${string}`;
export type HexString32 = HexString;
export type HexAddress = HexString;
export type EncodedProof = HexString;

export type ClientWithCustomRpc<
  rpcSchema extends RpcSchema,
  chain extends Chain | undefined = Chain | undefined,
> = Client<Transport, chain, undefined, rpcSchema>;
export type ClientPair<
  client2 extends Client = Client,
  client1 extends Client = Client,
> = {
  client1: client1;
  client2: client2;
};

export type ChainId = number;
export type ChainPair = {
  chain1: ChainId;
  chain2: ChainId;
};

export type RecursiveArray<T> = T | readonly RecursiveArray<T>[];
