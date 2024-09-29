import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { EthSelfRollup } from '../../../src/eth/EthSelfRollup.js';
import { Gateway } from '../../../src/gateway.js';
import { deployProxy } from '../../gateway/common.js';
import { describe } from '../../bun-describe-fix.js';
import { afterAll, expect, test } from 'bun:test';

describe('local self', async () => {
  const foundry = await Foundry.launch({
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const rollup = new EthSelfRollup(foundry.provider);
  rollup.latestBlockTag = 'latest';
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, {
    protocol: 'raw',
    log: false,
  });
  afterAll(() => ccip.http.close());

  // setup verifier
  const verifier = await foundry.deploy({ file: 'EthSelfVerifier' });
  const proxy = await deployProxy(foundry, verifier);
  await foundry.confirm(proxy.setGatewayURLs([ccip.endpoint]));
  await foundry.confirm(proxy.setWindow(rollup.defaultWindow));

  // setup backend contract (L2)
  const backend = await foundry.deploy({ file: 'Backend' });
  await foundry.confirm(backend.set(1, 'chonk'));
  await foundry.confirm(backend.set(2, 'raffy'));

  // setup frontend contract (L1)
  const frontend = await foundry.deploy({
    file: 'Frontend',
    args: [proxy, backend],
  });

  test('key = 0', async () => {
    expect(await frontend.get(0, { enableCcipRead: true })).toEqual('');
  });
  test('key = 1', async () => {
    expect(await frontend.get(1, { enableCcipRead: true })).toEqual('chonk');
  });
  test('key = 2', async () => {
    expect(await frontend.get(2, { enableCcipRead: true })).toEqual('raffy');
  });
});