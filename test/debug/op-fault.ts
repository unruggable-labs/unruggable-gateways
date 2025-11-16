import { Foundry } from '@adraffy/blocksmith';
import { CHAINS } from '../../src/chains.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { providerURL } from '../providers.js';

const foundry = await Foundry.launch({
  infoLog: true,
  fork: providerURL(CHAINS.SEPOLIA),
});

const OPFaultGameFinder = await foundry.deploy({ file: 'OPFaultGameFinder' });

const index = await OPFaultGameFinder.findGameIndex(
  [OPFaultRollup.sepoliaConfig.AnchorStateRegistry, 21600, [], []],
  0
);

console.log({ index });

console.log(
  await OPFaultGameFinder.gameAtIndex(
    [OPFaultRollup.sepoliaConfig.AnchorStateRegistry, 21600, [], []],
    index
  )
);

await foundry.shutdown();
