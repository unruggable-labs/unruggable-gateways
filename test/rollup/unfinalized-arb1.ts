import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { createProviderPair } from '../providers.js';

console.log(new Date());

const config = BoLDRollup.arb1MainnetConfig;
const rollup = new BoLDRollup(createProviderPair(config), config, 1800);

console.time('sync');
const commit0 = await rollup.fetchLatestCommit();
console.timeEnd('sync');
console.log({
  hashes: commit0.assertions.length,
  proofBytes: commit0.encodedRollupProof.length,
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

// rollup.minAgeBlocks = 0;
// const final = await rollup.fetchLatestCommit();
// rollup.minAgeBlocks = 50000;
// const finalPrev = await rollup.fetchParentCommit(final);
// console.log(final.index);
// console.log(finalPrev.index);

rollup.minAgeBlocks = 1;
const commits = await rollup.fetchRecentCommits(5);
// console.log(commits[0]);
const v = commits.map((x) => Number(x.index));
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-03-07T21:18:42.734Z
// [2.33s] sync
// {
//   hashes: 147,
//   proofBytes: 20610,
// }
// {
//   Rollup: "0x4DCeB440657f21083db8aDd07665f8ddBe1DCfc0",
//   defaultWindow: 1800,
// }
//      1 21997283n 153
//    300 21996984n 152
//    600 21996685n 151
//   1800 21995495n 147
//      0 21951626n 2
// [ 299, 299, 299, 296 ]
