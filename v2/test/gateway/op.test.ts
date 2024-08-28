import { serve } from '@resolverworks/ezccip';
import { afterAll, describe } from 'bun:test';
import { Gateway } from '../../src/gateway.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { Foundry } from '../foundry.js';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';

describe('op', async () => {
  const config = OPFaultRollup.mainnetConfig;
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
    // OPFaultVerifier is too slow in fork mode (30sec+)
    file: 'FixedOPFaultVerifier',
    args: [
      [ccip.endpoint],
      rollup.defaultWindow,
      rollup.OptimismPortal,
      rollup.gameTypeBitMask,
      commit.index,
    ],
  });
  // https://optimistic.etherscan.io/address/0xf9d79d8c09d24e0C47E32778c830C545e78512CF
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0xf9d79d8c09d24e0C47E32778c830C545e78512CF'],
  });
  runSlotDataTests(reader);
});
