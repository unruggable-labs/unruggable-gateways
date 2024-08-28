import { serve } from '@resolverworks/ezccip';
import { afterAll, describe } from 'bun:test';
import { Gateway } from '../../src/gateway.js';
import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { Foundry } from '../foundry.js';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';

describe('linea', async () => {
  const config = LineaRollup.mainnetConfig;
  const rollup = new LineaRollup(createProviderPair(config), config);
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
    file: 'LineaVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, rollup.L1MessageService],
    libs: {
      SparseMerkleProof: config.SparseMerkleProof,
    },
  });
  // https://lineascan.build/address/0x48F5931C5Dbc2cD9218ba085ce87740157326F59#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x48F5931C5Dbc2cD9218ba085ce87740157326F59'],
  });
  runSlotDataTests(reader);
});
