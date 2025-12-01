import { serve } from '@namestone/ezccip/serve';
import { Foundry } from '@adraffy/blocksmith';
import { EthSelfRollup } from '../../../src/eth/EthSelfRollup.js';
import { Gateway } from '../../../src/gateway.js';
import { describe } from '../../bun-describe-fix.js';
import { afterAll, expect, test } from 'bun:test';
import { LATEST_BLOCK_TAG } from '../../../src/utils.js';

describe('local program', async () => {
  const foundry = await Foundry.launch({
    infoLog: false,
  });
  afterAll(foundry.shutdown);
  const rollup = new EthSelfRollup(foundry.provider);
  rollup.latestBlockTag = LATEST_BLOCK_TAG;
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, { protocol: 'raw', log: false });
  afterAll(ccip.shutdown);

  // setup verifier
  const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
  const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
  const verifier = await foundry.deploy({
    file: 'SelfVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, hooks],
    libs: { GatewayVM },
  });

  // setup backend contract (L2) - data is set in constructor
  const People = await foundry.deploy({ file: 'People' });

  // setup frontend contract (L1)
  const GetPeople = await foundry.deploy({
    file: 'GetPeople',
    args: [verifier, People],
  });

  test('get name and age (program version)', async () => {
    expect(await GetPeople.getProgram(1, { enableCcipRead: true })).toEqual('Alice is 25');
  });
  
  test('get name and age (program version - Bob)', async () => {
    expect(await GetPeople.getProgram(2, { enableCcipRead: true })).toEqual('Bob is 30');
  });
  
  test('get name and age (program version - long name)', async () => {
    expect(await GetPeople.getProgram(3, { enableCcipRead: true })).toEqual('Christopher Alexander Johnson-Williams is 42');
  });
});
