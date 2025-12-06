import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = OPFaultRollup.celoSepoliaConfig;
const rollup = new OPFaultRollup(createProviderPair(config), config, 1);

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-12-06T03:20:55.542Z
// {
//   index: 2767n,
//   blockHash: "0xa7d601e3c1b6d493ea3773309b750834fa474eda020785661edf1fff78a701c1",
//   stateRoot: "0xac05a38615fbcd45666b815f8725e617d89cdd6bc79fbb20cece7577dc37818f",
//   passerRoot: "0x0be141e9301fe696c29f4bcdc9073e22aa8f390e4f0c6de58c63cdbbfe370bd6",
//   prover: EthProver[block=11702648],
//   game: {
//     gameType: 42n,
//     created: 1764990324n,
//     gameProxy: "0x8C14b9d8400eF229221Df0272ffab01eB325b4Fd",
//     l2BlockNumber: 11702648n,
//     rootClaim: "0xddeebecb2f0394c2296acc09c3f40a2a7bd107e7b7ba58e0a2fff3c4272815b2",
//   },
// }
// [ 2767, 2766, 2765, 2764, 2763, 2762, 2761, 2760 ]
// [ 1, 1, 1, 1, 1, 1, 1 ]
