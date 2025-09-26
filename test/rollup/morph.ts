import { MorphRollup } from '../../src/morph/MorphRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = MorphRollup.mainnetConfig;
const rollup = new MorphRollup(createProviderPair(config), config);

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 1925, 1924, 1923, 1922, 1921, 1920, 1919, 1918, 1917, 1916 ]
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
