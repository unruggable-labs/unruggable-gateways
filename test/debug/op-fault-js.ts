import { CHAINS } from '../../src/chains.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { createProviderPair } from '../providers.js';
import { Contract } from 'ethers';

const rollup = new OPFaultRollup(createProviderPair(CHAINS.BASE), OPFaultRollup.baseMainnetConfig);

const DisputeGameFactory = new Contract(
  await rollup.AnchorStateRegistry.disputeGameFactory(),
  [
    `function gameCount() view returns (uint256)`,
    `function gameAtIndex(uint256) view returns (uint256 gameType, uint256 created, address gameProxy)`,
  ],
  rollup.provider1,
);

const gameCount = await DisputeGameFactory.gameCount();

console.log({
    GameFinder: rollup.GameFinder.target,
    AnchorStateRegistry: rollup.AnchorStateRegistry.target,
    DisputeGameFactory: DisputeGameFactory.target,
    gameCount
});

console.log(await rollup.GameFinder.gameAtIndex(rollup.paramTuple, gameCount - 1n));