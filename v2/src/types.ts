import type {JsonRpcApiProvider, BigNumberish} from 'ethers';

export type {BigNumberish};
export type HexString = string;
export type Resolvable<T> = T | Promise<T>;
export type Proof = HexString[];

export type Provider = JsonRpcApiProvider;
export type ProviderPair = {
	provider1: Provider;
	provider2: Provider;
};
