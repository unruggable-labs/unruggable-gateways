import { serve } from '@namestone/ezccip/serve';
import { Foundry } from '@adraffy/blocksmith';
import { EthSelfRollup } from '../../../src/eth/EthSelfRollup.js';
import { Gateway } from '../../../src/gateway.js';
import { describe } from '../../bun-describe-fix.js';
import { afterAll, expect, test } from 'bun:test';
import { LATEST_BLOCK_TAG } from '../../../src/utils.js';

describe('local self', async () => {
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

  // setup backend contract (L2)
  const Backend = await foundry.deploy({ file: 'Backend' });
  await foundry.confirm(Backend.set(1, 'chonk'));
  await foundry.confirm(Backend.set(2, 'raffy'));

  // setup frontend contract (L1)
  const Frontend = await foundry.deploy({
    file: 'Frontend',
    args: [verifier, Backend],
  });

  test('key = 0', async () => {
    expect(await Frontend.get(0, { enableCcipRead: true })).toEqual('');
  });
  test('key = 1', async () => {
    expect(await Frontend.get(1, { enableCcipRead: true })).toEqual('chonk');
  });
  test('key = 2', async () => {
    expect(await Frontend.get(2, { enableCcipRead: true })).toEqual('raffy');
  });
});
