
import { CHAINS } from '../../src/chains.js';
import { toPaddedHex } from '../../src/utils.js';
import {createProvider, createProviderPair} from '../providers.js';
import {StarknetRollup} from '../../src/starknet/StarknetRollup.js';
import {StarknetProver} from '../../src/starknet/StarknetProver.js';
import {EthProver} from '../../src/eth/EthProver.js';


const config = StarknetRollup.mainnetConfig;
const rollup = new StarknetRollup(createProviderPair(config), config);
const commit = await rollup.fetchLatestCommit();

console.log(commit);
//console.log(await rollup.fetchParentCommitIndex(commit));

console.log(JSON.stringify(await commit.prover.fetchProofs(
	'0x02f46e52863c224cC55F68830e398CDD39eE1a8f141D4B4c2Af97bE13934FA4f', 
	[0n]
), null, '  '));

console.log(JSON.stringify(await commit.prover.fetchProofs(
	'0x02f46e52863c224cC55F68830e398CDD39eE1a8f141D4B4c2Af97bE13934FA4e', 
	[0n]
), null, '  '));

console.log(await commit.prover.isContract('0x02f46e52863c224cC55F68830e398CDD39eE1a8f141D4B4c2Af97bE13934FA4f'));
console.log(await commit.prover.isContract('0x02f46e52863c224cC55F68830e398CDD39eE1a8f141D4B4c2Af97bE13934FA4e'));

//console.log(await prover.fetchBlock());

// console.log(await provider.send('pathfinder_getProof', [
// 	{"block_number": parseInt('0xdd8c9')},
// 	'0x02f46e52863c224cC55F68830e398CDD39eE1a8f141D4B4c2Af97bE13934FA4f', 
// 	[toPaddedHex(0)]
// ]));
