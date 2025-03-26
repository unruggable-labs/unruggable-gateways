import { Foundry } from '@adraffy/blocksmith';
import { serve } from '@namestone/ezccip/serve';
import { EuclidRollup } from '../../src/scroll/EuclidRollup.js';
import { createProviderPair, beaconURL, providerURL } from '../providers.js';
import { setupTests, testName } from './common.js';
import { Gateway } from '../../src/gateway.js';
import { afterAll } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

const config = EuclidRollup.sepoliaConfig;
describe.skipIf(!!process.env.IS_CV)(testName(config), async () => {
  const rollup = new EuclidRollup(
    createProviderPair(config),
    config,
    beaconURL(config.chain1)
  );
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: true,
  });
  afterAll(foundry.shutdown);
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, { protocol: 'raw', log: true });
  afterAll(ccip.shutdown);
  const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
  const EthVerifierHooks = await foundry.deploy({
    file: 'EthVerifierHooks',
  });
  const verifier = await foundry.deploy({
    file: 'ScrollVerifier',
    args: [
      [ccip.endpoint],
      rollup.defaultWindow,
      EthVerifierHooks,
      rollup.ScrollChain,
    ],
    libs: { GatewayVM },
  });
  await setupTests(verifier, {
    // https://sepolia.scrollscan.com/address/0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05#code
    slotDataContract: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
    // https://sepolia.scrollscan.com/address/0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8#code
    slotDataPointer: '0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8',
  });
});
