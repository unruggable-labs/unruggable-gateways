import { createProviderPair } from '../providers.js';
import { UnfinalizedLineaRollup } from '../../src/linea/UnfinalizedLineaRollup.js';
import { LineaRollup } from '../../src/linea/LineaRollup.js';

console.log(new Date());

const config = LineaRollup.mainnetConfig;
const rollup = new UnfinalizedLineaRollup(
  createProviderPair(config),
  config,
  1
);

console.log(BigInt((await rollup.fetchLatestCommit()).prover.block));
console.log(await new LineaRollup(rollup, config).fetchLatestCommitIndex());

const commits = await rollup.fetchRecentCommits(8);
console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2024-10-08T03:13:08.630Z
// 10448913n
// 10440662n
// [ 20917442, 20917007, 20916976, 20916927, 20916919, 20916907, 20916902, 20916672 ]
// [ 435, 31, 49, 8, 12, 5, 230 ]
