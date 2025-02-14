import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { createProviderPair, providerURL } from '../providers.js';

const config = LineaRollup.mainnetConfig;
const rollup = new LineaRollup(createProviderPair(config), config);

console.log('provider1', providerURL(rollup.provider1._network.chainId));
console.log('provider2', providerURL(rollup.provider2._network.chainId));

console.log({
  L1MessageService: rollup.L1MessageService.target,
  defaultWindow: rollup.defaultWindow,
});

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// [ 8173614, 8169917, 8164460, 8160129, 8155452, 8151921, 8148471, 8143612, 8139006, 8131001 ]
// [ 3697, 5457, 4331, 4677, 3531, 3450, 4859, 4606, 8005 ]
