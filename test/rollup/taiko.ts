import { TaikoRollup } from '../../src/taiko/TaikoRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = TaikoRollup.mainnetConfig;
const rollup = new TaikoRollup(createProviderPair(config), config);

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

const aligned = await rollup.fetchLatestCommitIndex();
const unaligned = await rollup.fetchCommit(aligned - 5n);
console.log(aligned);
console.log(unaligned.index);
console.log(await rollup.fetchParentCommitIndex(unaligned));

// 2025-06-09T19:23:15.349Z
// [ 16, 16, 16, 16, 16, 16, 16 ]
// 1198168n
// 1198163n
// 1198147n
