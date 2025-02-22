import { NitroRollup } from '../../src/arbitrum/NitroRollup.js';
import { createProviderPair } from '../providers.js';

const config = NitroRollup.apeMainnetConfig;
const rollup = new NitroRollup(createProviderPair(config), config);

console.log({
  Rollup: rollup.Rollup.target,
  defaultWindow: rollup.defaultWindow,
});

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 3873, 3872, 3871, 3870, 3869, 3868, 3867, 3866, 3865, 3864 ]
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
