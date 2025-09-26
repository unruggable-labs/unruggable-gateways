import { StarknetRollup } from '../../src/starknet/StarknetRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = StarknetRollup.mainnetConfig;
const rollup = new StarknetRollup(createProviderPair(config), config);

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 908869, 908815, 908751, 908693, 908640, 908578, 908534, 908500, 908437, 908373 ]
// [ 54, 64, 58, 53, 62, 44, 34, 63, 64 ]
