import { CcipReadRouter } from '@ensdomains/ccip-read-router';
import { afterAll, describe } from 'bun:test';
import { Gateway } from '../../src/gateway.js';
import { OPRollup } from '../../src/op/OPRollup.js';
import { Foundry } from '../foundry.js';
import { createClientPair, transportUrl } from '../providers.js';
import { runSlotDataTests } from './tests.js';

describe('base', async () => {
  const config = OPRollup.baseMainnetConfig;
  const rollup = new OPRollup(createClientPair(config), config);
  const foundry = await Foundry.launch({
    fork: transportUrl(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const router = CcipReadRouter();
  gateway.register(router);

  const server = Bun.serve(router);

  afterAll(() => server.stop());
  const verifier = await foundry.deploy({
    file: 'OPVerifier',
    args: [
      [`http://${server.hostname}:${server.port}`],
      rollup.defaultWindow,
      rollup.l2OutputOracle.address,
    ],
  });
  // https://basescan.org/address/0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6'],
  });
  runSlotDataTests(reader);
});
