import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { createProviderPair } from '../providers.js';

const config = BoLDRollup.arb1MainnetConfig;
const rollup = new BoLDRollup(createProviderPair(config), config, 1);

console.log({
  Rollup: rollup.Rollup.target,
  defaultWindow: rollup.defaultWindow,
});

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

console.log(await rollup.fetchGenesisCommit());

// [ 21900293, 21899994, 21899696, 21899399, 21899100, 21898801, 21898503, 21898205, 21897905, 21897608 ]
// [ 299, 298, 297, 299, 299, 298, 298, 300, 297 ]
