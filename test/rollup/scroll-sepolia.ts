import { EuclidRollup } from '../../src/scroll/EuclidRollup.js';
import { beaconURL, createProviderPair, providerURL } from '../providers.js';

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

console.log(await rollup.fetchLatestCommitIndex());
//const commit = await rollup.fetchLatestCommit();
//console.log(commit);

console.log(providerURL(config.chain1));
console.log(providerURL(config.chain2));

console.log(
  await rollup.provider2.send('eth_getProof', [
    '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
    [],
    'latest',
  ])
);

// console.log(
//   await prover.fetchProofs('0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05', [
//     1n,
//   ])
// );

// const commits = await rollup.fetchRecentCommits(10);

// const v = commits.map((x) => Number(x.index));
// console.log(v);
// console.log(v.slice(1).map((x, i) => v[i] - x));
