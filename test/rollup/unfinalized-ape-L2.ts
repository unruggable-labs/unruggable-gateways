import { NitroRollup } from '../../src/arbitrum/NitroRollup.js';
import { createProviderPair } from '../providers.js';

const config = NitroRollup.apeMainnetConfig;
const rollup = new NitroRollup(createProviderPair(config), config, 3600 / 2);

console.log({
  L2Rollup: rollup.Rollup.target,
  defaultWindow: rollup.defaultWindow,
});

console.log(new Date());
console.log(await rollup.fetchLatestNode(1));
console.log(await rollup.fetchLatestCommitIndex());
console.log(await rollup.fetchLatestNode(10000));
console.log(await rollup.fetchLatestNode());

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-02-19T02:57:57.008Z
// 4045n
// 4045n
// 4045n
// 3892n
// [ 4045, 4044, 4043, 4042, 4041, 4040, 4039, 4038, 4037, 4036 ]
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
