import { Foundry } from '@adraffy/blocksmith';
import { CHAINS } from '../../src/chains.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { providerURL } from '../providers.js';

const foundry = await Foundry.launch({
  infoLog: true,
  fork: providerURL(CHAINS.MAINNET),
});

const OPFaultGameFinder = await foundry.deploy({ file: 'OPFaultGameFinder' });

const paramTuple = [
  OPFaultRollup.mainnetConfig.AnchorStateRegistry,
  21600,
  [],
  [],
];

const index = await OPFaultGameFinder.findGameIndex(paramTuple, 0);

console.log({ index });

console.log(await OPFaultGameFinder.gameAtIndex(paramTuple, index));

await foundry.shutdown();
