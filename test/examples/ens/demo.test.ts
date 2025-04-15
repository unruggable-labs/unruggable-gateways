import { Foundry } from '@adraffy/blocksmith';
import { EthSelfRollup } from '../../../src/eth/EthSelfRollup.js';
import { Gateway } from '../../../src/gateway.js';
import { describe } from '../../bun-describe-fix.js';
import { afterAll, expect, test } from 'bun:test';
import { id as keccakStr } from 'ethers/hash';
import { EnsResolver } from 'ethers/providers';
import { serve } from '@namestone/ezccip/serve';

describe('ens', async () => {
  const foundry = await Foundry.launch({
    infoLog: false,
  });
  afterAll(foundry.shutdown);
  const rollup = new EthSelfRollup(foundry.provider);
  rollup.latestBlockTag = 'latest';
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

  // setup storage contract (L2)
  const L2Storage = await foundry.deploy({ file: 'L2Storage' });

  const avatar = 'https://raffy.antistupid.com/ens.jpg';
  const address = '0x51050ec063d393217B436747617aD1C2285Aeeee';
  const contenthash = '0xe30101701202dead';
  const node = keccakStr('raffy');
  const BASE = 0x8000000 + 8453;

  await foundry.confirm(L2Storage.setText(node, 'avatar', avatar));
  await foundry.confirm(L2Storage.setAddr(node, 60, address));
  await foundry.confirm(L2Storage.setAddr(node, BASE, address));
  await foundry.confirm(L2Storage.setContenthash(node, contenthash));

  // setup resolver contract (L1)
  const L1Resolver = await foundry.deploy({
    file: 'L1Resolver',
    args: [verifier, L2Storage],
  });

  function getResolver(name: string) {
    return new EnsResolver(foundry.provider, L1Resolver.target, name);
  }

  test('avatar', async () => {
    expect(await getResolver('raffy.chonk').getAvatar(), avatar);
  });
  test('addr(eth)', async () => {
    expect(await getResolver('raffy.chonk').getAddress(), address);
  });
  test('addr(base)', async () => {
    expect(await getResolver('raffy.chonk').getAddress(BASE), address);
  });
  test('contenthash', async () => {
    expect(await getResolver('raffy.chonk').getContentHash(), contenthash);
  });
  test('unset text', async () => {
    expect(await getResolver('raffy.chonk').getText('chonk'), '');
  });
  test('unset addr', async () => {
    expect(await getResolver('raffy.chonk').getAddress(0x80000000), '0x');
  });
  test('unknown name', async () => {
    expect(await getResolver('_dne123').getAddress(), '0x');
  });
});
