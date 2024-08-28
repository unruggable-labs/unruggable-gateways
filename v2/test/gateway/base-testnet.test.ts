import { serve } from '@resolverworks/ezccip';
import { afterAll, describe } from 'bun:test';
import { Gateway } from '../../src/gateway.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { Foundry } from '../foundry.js';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';

describe('base testnet', async () => {
  const config = OPFaultRollup.baseTestnetConfig;
  const rollup = await OPFaultRollup.create(createProviderPair(config), config);
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
  const commit = await gateway.getLatestCommit();
  const verifier = await foundry.deploy({
    file: 'FixedOPFaultVerifier',
    args: [
      [ccip.endpoint],
      rollup.defaultWindow,
      rollup.OptimismPortal,
      rollup.gameTypeBitMask,
      commit.index,
    ],
  });
  // https://sepolia.basescan.org/address/0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411'],
  });
  runSlotDataTests(reader);
});
