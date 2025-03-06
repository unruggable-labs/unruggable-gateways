import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = BoLDRollup.arb1MainnetConfig;
const rollup = new BoLDRollup(createProviderPair(config), config, 1);
rollup.getLogsStepSize = 10000;

console.time('sync');
const commit0 = await rollup.fetchLatestCommit();
console.timeEnd('sync');
console.log({
  hashes: commit0.assertions.length,
  proofBytes: commit0.encodedRollupProof.length,
});

console.log({
  Rollup: rollup.Rollup.target,
  defaultWindow: rollup.defaultWindow,
});

// https://etherscan.io/advanced-filter?eladd=0x4dceb440657f21083db8add07665f8ddbe1dcfc0&eltpc=0xfc42829b29c259a7370ab56c8f69fce23b5f351a9ce151da453281993ec0090c
const blocksPerCommit = 3600 / 12;
for (const age of [
  1,
  blocksPerCommit,
  2 * blocksPerCommit,
  6 * blocksPerCommit,
  0,
]) {
  rollup.minAgeBlocks = age;
  const commit = await rollup.fetchLatestCommit();
  console.log(
    age.toString().padStart(6),
    commit.index,
    commit.assertions.length
  );
}

rollup.minAgeBlocks = 1;
const commits = await rollup.fetchRecentCommits(5);
const v = commits.map((x) => Number(x.index));
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-03-06T01:31:03.890Z
// [2.68s] sync
// {
//   hashes: 154,
//   proofBytes: 21506,
// }
// {
//   Rollup: "0x4DCeB440657f21083db8aDd07665f8ddBe1DCfc0",
//   defaultWindow: 1800,
// }
//      1 21984464n 154
//    300 21984166n 153
//    600 21983866n 152
//   1800 21982670n 148
//      0 21938478n 2
// [ 298, 300, 299, 297 ]
