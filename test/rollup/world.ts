import { Contract } from 'ethers';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { createProvider } from '../providers.js';
import { CHAINS } from '../../src/chains.js';

// console.log(new Date());

// const config = OPFaultRollup.worldMainnetConfig;
// const rollup = new OPFaultRollup(createProviderPair(config), config);

// const commits = await rollup.fetchRecentCommits(8);
// console.log(commits[0]);
// const v = commits.map((x) => Number(x.index));
// console.log(v);
// console.log(v.slice(1).map((x, i) => v[i] - x));

const provider = createProvider(CHAINS.MAINNET);

const OptimismPortal = new Contract(
  '0xd5ec14a83B7d95BE1E2Ac12523e2dEE12Cbeea6C',
  OPFaultRollup.ANCHOR_STATE_REGISTRY_ABI, // same as portal
  provider
);

const respectedGameType = await OptimismPortal.respectedGameType();
const disputeGameFactory = await OptimismPortal.disputeGameFactory();

console.log({ respectedGameType, disputeGameFactory });

const GameFinder = new Contract(
  '0x61F50A76bfb2Ad8620A3E8F81aa27f3bEb1Db0D7',
  [
    `function findGameIndex(address portal, uint256 minAgeSec, uint256 gameTypeBitMask, uint256 gameCount) view returns (uint256)`,
  ],
  provider
);

const gameIndex = await GameFinder.findGameIndex(OptimismPortal, 1, 0, 0);

console.log({ gameIndex });
