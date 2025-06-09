import { createProviderPair } from '../providers.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';

console.log(new Date());

const config = OPFaultRollup.mainnetConfig;
const rollup = new OPFaultRollup(createProviderPair(config), config, 3600);

console.log(await rollup.fetchLatestCommitIndex());
console.log(await new OPFaultRollup(rollup, config).fetchLatestCommitIndex());

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2024-10-08T03:28:28.418Z
// 2886n
// 2804n
// [ 2886, 2885, 2884, 2883, 2882, 2881, 2880, 2879 ]
// [ 1, 1, 1, 1, 1, 1, 1 ]
