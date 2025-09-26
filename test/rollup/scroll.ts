import { EuclidRollup } from '../../src/scroll/EuclidRollup.js';
import { beaconURL, createProviderPair } from '../providers.js';

console.log(new Date());

const config = EuclidRollup.mainnetConfig;
const rollup = new EuclidRollup(
  createProviderPair(config),
  config,
  beaconURL(config.chain1)
);

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-05-05T01:37:21.209Z
// [ 358838, 358832, 358826, 358820, 358811 ]
// [ 6, 6, 6, 9 ]
