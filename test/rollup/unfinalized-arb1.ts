import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { UnfinalizedBoLDRollup } from '../../src/arbitrum/UnfinalizedBoLDRollup.js';
import { createProviderPair } from '../providers.js';

const config = BoLDRollup.arb1MainnetConfig;
const rollup = new UnfinalizedBoLDRollup(createProviderPair(config), config);
rollup.getLogsStepSize = 10000;

console.time('sync');
const commit0 = await rollup.fetchLatestCommit();
console.timeEnd('sync');
console.log({
  hashes: commit0.assertionHashes.length,
  proofBytes: commit0.encodedRollupProof.length,
});

// https://etherscan.io/advanced-filter?eladd=0x4dceb440657f21083db8add07665f8ddbe1dcfc0&eltpc=0xfc42829b29c259a7370ab56c8f69fce23b5f351a9ce151da453281993ec0090c
const blocksPerCommit = 3600 / 12;

console.log({
  Rollup: rollup.Rollup.target,
  defaultWindow: rollup.defaultWindow,
});

console.log(new Date());
for (const age of [
  1,
  blocksPerCommit,
  2 * blocksPerCommit,
  1800,
  /*confirmPeriodBlocks*/ 45818,
]) {
  rollup.minAgeBlocks = age;
  const commit = await rollup.fetchLatestCommit();
  console.log(
    age.toString().padStart(6),
    commit.index,
    commit.assertionHashes.length
  );
}

rollup.minAgeBlocks = 1;
const commits = await rollup.fetchRecentCommits(5);
const v = commits.map((x) => Number(x.index));
console.log(v.slice(1).map((x, i) => v[i] - x));

// {
//   hashes: 155,
//   proofBytes: 21698,
// }
// {
//   Rollup: "0x4DCeB440657f21083db8aDd07665f8ddBe1DCfc0",
//   defaultWindow: 1800,
// }
// 2025-03-05T06:49:06.040Z
//      1 21978805n 155
//    300 21978508n 154
//    600 21978209n 153
//  45818 21933103n 2
// [ 297, 299, 299, 299 ]
