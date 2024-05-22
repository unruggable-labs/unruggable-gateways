import {ethers, type BytesLike} from 'ethers';

// convenience to decode a single ABI type
export function decodeType(type: string, data: BytesLike) {
	return ethers.AbiCoder.defaultAbiCoder().decode([type], data)[0];
}
