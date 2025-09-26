import { OPRollup } from '../../src/op/OPRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = OPRollup.blastMainnnetConfig;
const rollup = new OPRollup(createProviderPair(config), config);

console.log(
  await rollup.OutputFinder.findOutputIndex(rollup.OptimismPortal, 0)
);
console.log(
  await rollup.OutputFinder.findOutputIndex(rollup.OptimismPortal, 1)
);

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-02-07T16:52:37.779Z
// 14568n
// 14737n
// [ 14568, 14567, 14566, 14565, 14564, 14563, 14562, 14561, 14560, 14559 ]
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
