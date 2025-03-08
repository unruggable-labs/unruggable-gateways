import { createProvider, createProviderPair } from '../providers.js';
import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { NitroRollup } from '../../src/arbitrum/NitroRollup.js';
import { DoubleArbitrumRollup } from '../../src/arbitrum/DoubleArbitrumRollup.js';

const config12 = BoLDRollup.arb1MainnetConfig;
const config23 = NitroRollup.apeMainnetConfig;

const provider12 = createProviderPair(config12);
const provider3 = createProvider(config23.chain2);

const ages = [
  [0, 0], // [L1, L2]
  [0, 1],
  [300, 0],
  [300, 1],
  [1, 0],
  [1, 1],
];
const rollup = new DoubleArbitrumRollup(
  new BoLDRollup(provider12, config12),
  provider3,
  config23
);

for (const [age12, age23] of ages) {
  rollup.rollup12.minAgeBlocks = age12;
  rollup.rollup23.minAgeBlocks = age23;
  const commit = await rollup.fetchLatestCommit();
  console.log(
    age12.toString().padStart(3),
    age23.toString().padStart(3),
    commit.commit12.index,
    commit.commit23.index
  );
}

//  L1 L2  Node1 Node2
//   0  0  17711   874
//   0  1  17711  1022
// 300  0  17863  1021
// 300  1  17863  1171
//   1  0  17864  1022
//   1  1  17864  1172
