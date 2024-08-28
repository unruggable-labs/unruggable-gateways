import { CcipReadRouter } from '@ensdomains/ccip-read-router';
import { afterAll, describe } from 'bun:test';
import { Gateway } from '../../src/gateway.js';
import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { Foundry } from '../foundry.js';
import { createClientPair, transportUrl } from '../providers.js';
import { runSlotDataTests } from './tests.js';

describe('scroll', async () => {
  const config = ScrollRollup.mainnetConfig;
  const rollup = await ScrollRollup.create(createClientPair(config), config);
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
    file: 'ScrollVerifier',
    args: [
      [`http://${server.hostname}:${server.port}`],
      rollup.defaultWindow,
      rollup.commitmentVerifier.address,
    ],
  });
  // https://scrollscan.com/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF'],
  });
  await runSlotDataTests(reader, true);
});
