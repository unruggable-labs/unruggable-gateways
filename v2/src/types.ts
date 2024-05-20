import type {BytesLike, BigNumberish, JsonRpcApiProvider} from 'ethers';

export type {BytesLike, BigNumberish};

export type Resolvable<T> = T | Promise<T>;
export type Proof = string[][];

export type Provider = JsonRpcApiProvider;
export type ProviderPair = {
	provider1: Provider;
	provider2: Provider;
};