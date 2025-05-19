import { TaikoRollup } from '../../src/taiko/TaikoRollup.js';
import { createProviderPair } from '../providers.js';

const config = TaikoRollup.mainnetConfig;
const rollup = new TaikoRollup(createProviderPair(config), config);

console.log({
  TaikoL1: rollup.TaikoL1.target,
  defaultWindow: rollup.defaultWindow,
});

console.log(await rollup.fetchLatestCommitIndex());

const commits = await rollup.fetchRecentCommits(5);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 288127, 288111, 288095, 288079, 288063, 288047, 288031, 288015, 287999, 287983 ]
// [ 16, 16, 16, 16, 16, 16, 16, 16, 16 ]

const unaligned = await rollup.fetchCommit(commits[0].index - 5n);
console.log(commits[0].index);
console.log(unaligned.index);
console.log(await rollup.fetchParentCommitIndex(unaligned));

// 288127n
// 288122n
// 288111n
