import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = OPFaultRollup.celoSepoliaConfig;
const rollup = new OPFaultRollup(createProviderPair(config), config);

// 20251106: OP Succinct => 42
console.log(await rollup.getGameTypes());

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-11-08T00:54:23.537Z
// [ 42n ]
// {
//   index: 829n,
//   blockHash: "0xe3dd18a8b67879253692ed7e22b913d300b301d0b4f0a80f623981d60d7aebe9",
//   stateRoot: "0x492e1c458eba6c74446b1d5deea49bcfce4e444846dfc6c5c32be820634923f3",
//   passerRoot: "0x2ccee89e537aa9843e497cdbc5f69c85f4103f758bb1e7c851bfe576a30b178b",
//   prover: EthProver[block=8970602],
//   game: {
//     gameType: 1n,
//     created: 1762257576n,
//     gameProxy: "0x4ebE05086edcAf69fc71a33012004EDaC365171f",
//     l2BlockNumber: 8970602n,
//     rootClaim: "0xbb787d616f0dbe98cdba1fb92de4f10075720c77421041b1e29f4e49c892ecfb",
//   },
// }
// [ 829, 828, 827, 826, 825, 824, 823, 822 ]
// [ 1, 1, 1, 1, 1, 1, 1 ]
