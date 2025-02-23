import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { createProviderPair } from '../providers.js';

const config = BoLDRollup.arb1MainnetConfig;
const rollup = new BoLDRollup(createProviderPair(config), config);

// https://etherscan.io/advanced-filter?eladd=0x4dceb440657f21083db8add07665f8ddbe1dcfc0&eltpc=0xfc42829b29c259a7370ab56c8f69fce23b5f351a9ce151da453281993ec0090c
const blocksPerCommit = 3600 / 12;

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

// 2025-02-23T05:37:38.457Z
//      1 21906846n
//    300 21906548n
//    600 21906252n
//      0 21860740n
// [ 298, 296, 296, 299, 297, 300, 298, 297, 298 ]
