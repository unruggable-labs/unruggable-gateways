import { createProvider, createProviderPair } from '../providers.js';
import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { DoubleNitroRollup } from '../../src/nitro/DoubleNitroRollup.js';

const config12 = NitroRollup.arb1MainnetConfig;
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

for (const [age12, age23] of ages) {
  const rollup = new DoubleNitroRollup(
    new NitroRollup(provider12, config12, age12),
    provider3,
    config23,
    age23
  );
  const commit = await rollup.fetchLatestCommit();
  console.log(age12, age23, commit.commit12.index, commit.commit23.index);
}

//  L1 L2  Node1 Node2
//   0  0  17711   874
//   0  1  17711  1022
// 300  0  17863  1021
// 300  1  17863  1171
//   1  0  17864  1022
//   1  1  17864  1172
