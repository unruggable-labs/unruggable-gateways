import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = OPFaultRollup.celoSepoliaConfig;
const rollup = new OPFaultRollup(createProviderPair(config), config);

// 20251106: OP Succinct => 46
console.log(await rollup.getGameTypes());

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-10-28T21:44:47.206Z
// {
//   index: 720n,
//   blockHash: "0x9d62ad6d8ca9e63aff55ada3e9cce4e0f0f558381edee30ab6d89868192c1d80",
//   stateRoot: "0x418d6c135d8a0133e2dd19989edabe344676bb2d3f1d700de8778f34cc0acd06",
//   passerRoot: "0x47eb03d8c215efbca17a3698fc1fc893685603d08e1c9240ef5249a59a1e9d78",
//   prover: EthProver[block=7792862],
//   game: {
//     gameType: 1n,
//     created: 1761079044n,
//     gameProxy: "0x1eAc427D298312911bA06126D31c368DFD994E58",
//     l2BlockNumber: 7792862n,
//     rootClaim: "0x10d4bbfb4e2be93f119f78c884bd3ba34a6a5465588653bb260a92caffc3c8ad",
//   },
// }
// [ 720, 719, 718, 717, 716, 715, 714, 713 ]
// [ 1, 1, 1, 1, 1, 1, 1 ]
