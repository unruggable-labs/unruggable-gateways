import { serve } from '@resolverworks/ezccip';
import { afterAll, describe } from 'bun:test';
import { Gateway } from '../../src/gateway.js';
import { OPRollup } from '../../src/op/OPRollup.js';
import { Foundry } from '../foundry.js';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';

describe('base', async () => {
  const config = OPRollup.baseMainnetConfig;
  const rollup = new OPRollup(createProviderPair(config), config);
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, {
    protocol: 'raw',
    log: false,
  });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'OPVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, rollup.L2OutputOracle],
  });
  // https://basescan.org/address/0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6'],
  });
  runSlotDataTests(reader);
});
