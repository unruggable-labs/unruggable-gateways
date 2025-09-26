import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = OPFaultRollup.baseMainnetConfig;
const rollup = new OPFaultRollup(createProviderPair(config), config);

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// (OLD: OPRollup)
// [ 10444, 10443, 10442, 10441, 10440, 10439, 10438, 10437, 10436, 10435 ]
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]

// (NEW: OPFaultRollup)
// [ 6, 2, 0 ]
// [ 4, 2 ]
