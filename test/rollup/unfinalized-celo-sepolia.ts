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

// 2025-11-08T00:55:08.548Z
// {
//   index: 962n,
//   blockHash: "0x44636f50f497a7458f7507a2562f7f5e277421305374f597cd7c00b6907c50f5",
//   stateRoot: "0xba59809c4f17180ed8d0616aa160a42ecaca3c51428c6ed8eee75a93de35e5fe",
//   passerRoot: "0x72f62ce7c0bba6e8874d8742f9e1ad7057b75f1ab432480ee539d1592dd4ba09",
//   prover: EthProver[block=9273448],
//   game: {
//     gameType: 42n,
//     created: 1762559988n,
//     gameProxy: "0x9889336882330755c34FBCbfC5867cED8893B011",
//     l2BlockNumber: 9273448n,
//     rootClaim: "0x33ec082591c7555827a93b32092fea58b6193f8a6e54a004c55bf61115153d17",
//   },
// }
// [ 962, 961, 960, 959, 958, 957, 956, 955 ]
// [ 1, 1, 1, 1, 1, 1, 1 ]
