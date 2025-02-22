import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { createProviderPair } from '../providers.js';

const config = BoLDRollup.arb1MainnetConfig;
const rollup = new BoLDRollup(createProviderPair(config), config, 300); // 1 hr / (12 sec/block)

console.log({
  L2Rollup: rollup.Rollup.target,
  defaultWindow: rollup.defaultWindow,
});

console.log(new Date());
console.log((await rollup.fetchLatestAssertion(1)).blockNumber);
console.log(await rollup.fetchLatestCommitIndex());
console.log((await rollup.fetchLatestAssertion(1000)).blockNumber);
console.log((await rollup.fetchLatestAssertion(0)).blockNumber);

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-02-22T22:05:27.077Z
// 21904465n
// 21904167n
// 21903568n
// 21858654n
// [ 21904167, 21903867, 21903568, 21903270, 21902971, 21902673, 21902374, 21902075, 21901778, 21901481 ]
// [ 300, 299, 298, 299, 298, 299, 299, 297, 297 ]
