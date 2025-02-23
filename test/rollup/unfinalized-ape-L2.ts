import { NitroRollup } from '../../src/arbitrum/NitroRollup.js';
import { createProviderPair } from '../providers.js';

const config = NitroRollup.apeMainnetConfig;
const rollup = new NitroRollup(createProviderPair(config), config);

// https://arbiscan.io/advanced-filter?eladd=0x374de579ae15ad59ed0519aeaf1a23f348df259c&eltpc=0x22ef0479a7ff660660d1c2fe35f1b632cf31675c2d9378db8cec95b00d8ffa3c
const blocksPerCommit = Math.round(3600 / 0.25); // ~hourly w/250ms blocks

console.log({
  Rollup: rollup.Rollup.target,
  defaultWindow: rollup.defaultWindow,
});

console.log(new Date());
for (const age of [1, blocksPerCommit, 2 * blocksPerCommit, 0]) {
  rollup.minAgeBlocks = age;
  console.log(
    age.toString().padStart(6),
    await rollup.fetchLatestCommitIndex()
  );
}

rollup.minAgeBlocks = 1;
const commits = await rollup.fetchRecentCommits(10);
const v = commits.map((x) => Number(x.index));
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-02-23T05:33:26.617Z
//      1 4143n
//  14400 4142n
//  28800 4141n
//      0 3990n
// [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ]
