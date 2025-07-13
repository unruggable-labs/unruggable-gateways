import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = OPFaultRollup.mainnetConfig;
const rollup = new OPFaultRollup(createProviderPair(config), config);

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 1534, 1533, 1532, 1531, 1530, 1529, 1528, 1527, 1526, 1525 ]
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
