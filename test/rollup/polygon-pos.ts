import { PolygonPoSRollup } from '../../src/polygon/PolygonPoSRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = PolygonPoSRollup.mainnetConfig;
const rollup = new PolygonPoSRollup(createProviderPair(config), config);

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 677870000, 677790000, 677750000, 677730000, 677680000 ]
// [ 80000, 40000, 20000, 50000 ]
