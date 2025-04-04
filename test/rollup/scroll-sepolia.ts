import { EuclidRollup } from '../../src/scroll/EuclidRollup.js';
import { beaconURL, createProviderPair } from '../providers.js';

console.log(new Date());

const config = EuclidRollup.sepoliaConfig;
const rollup = new EuclidRollup(
  createProviderPair(config),
  config,
  beaconURL(config.chain1)
);

console.log({
  ScrollChain: rollup.ScrollChain.target,
  defaultWindow: rollup.defaultWindow,
});

const commits = await rollup.fetchRecentCommits(10);

const v = commits.map((x) => Number(x.index));
console.log(v);
console.log(v.slice(1).map((x, i) => v[i] - x));

// 2025-04-04T04:06:55.314Z
// [ 86604, 86601, 86598, 86595, 86592, 86589, 86586, 86583, 86580, 86577 ]
// [ 3, 3, 3, 3, 3, 3, 3, 3, 3 ]
