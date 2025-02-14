import { PolygonPoSRollup } from '../../src/polygon/PolygonPoSRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip/serve';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { setupTests, testName } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

const config = PolygonPoSRollup.mainnetConfig;
// 20240923: disabled until polygon has non-erigon rpcs
describe.skipIf(!!process.env.IS_CI)(testName(config), async () => {
  const rollup = new PolygonPoSRollup(createProviderPair(config), config);
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(foundry.shutdown);
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, { protocol: 'raw', log: false });
  afterAll(ccip.shutdown);
  const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
  const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
  const verifier = await foundry.deploy({
    file: 'PolygonPoSVerifier',
    args: [
      [ccip.endpoint],
      rollup.defaultWindow,
      hooks,
      rollup.RootChain,
      rollup.poster.address,
    ],
    libs: { GatewayVM },
  });
  await setupTests(verifier, {
    // https://polygonscan.com/address/0x5BBf0fD3Dd8252Ee03bA9C03cF92F33551584361#code
    slotDataContract: '0x5BBf0fD3Dd8252Ee03bA9C03cF92F33551584361',
    // https://polygonscan.com/address/0x8e40F7Aa288E703A8D01c84d52dE7f1B7321e14e#code
    slotDataPointer: '0x8e40F7Aa288E703A8D01c84d52dE7f1B7321e14e',
  });
});
