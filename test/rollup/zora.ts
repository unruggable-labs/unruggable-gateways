import { OPRollup } from '../../src/op/OPRollup.js';
import { createProviderPair } from '../providers.js';

const config = OPRollup.zoraMainnetConfig;
const rollup = new OPRollup(createProviderPair(config), config);

console.log({
  OptimismPortal: rollup.OptimismPortal,
  OutputFinder: rollup.OutputFinder.target,
  defaultWindow: rollup.defaultWindow,
});

console.log(new Date());
console.log(
  await rollup.OutputFinder.findOutputIndex(rollup.OptimismPortal, 0)
);
console.log(
  await rollup.OutputFinder.findOutputIndex(rollup.OptimismPortal, 1)
);

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-02-07T16:52:37.779Z
// 14568n
// 14737n
// [ 14568, 14567, 14566, 14565, 14564, 14563, 14562, 14561, 14560, 14559 ]
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
