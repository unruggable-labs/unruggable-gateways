// run "real" finder on fork
// warning: very slow since it requires many rpc calls

import { Foundry } from '@adraffy/blocksmith';
import { CHAINS } from '../../../src/chains.js';
import { OPFaultRollup } from '../../../src/op/OPFaultRollup.js';
import { providerURL } from '../../providers.js';

const foundry = await Foundry.launch({
  infoLog: true,
  fork: providerURL(CHAINS.SEPOLIA),
});
try {
  const OPFaultGameFinder = await foundry.deploy({ file: 'OPFaultGameFinder' });
  const paramTuple = [
    OPFaultRollup.sepoliaConfig.AnchorStateRegistry,
    21600, // minAgeSec
    [],
    [],
  ];
  const gameIndex = await OPFaultGameFinder.findGameIndex(paramTuple, 0);
  console.log({ gameIndex });
  console.log(await OPFaultGameFinder.gameAtIndex(paramTuple, gameIndex));
} finally {
  await foundry.shutdown();
}
