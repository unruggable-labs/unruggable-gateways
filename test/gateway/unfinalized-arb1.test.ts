import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip/serve';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, createProviderPair } from '../providers.js';
import { setupTests, testName } from './common.js';
import { afterAll } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

const config = NitroRollup.arb1MainnetConfig;
describe.skipIf(!!process.env.IS_CI)(
  testName(config, { unfinalized: true }),
  async () => {
    const rollup = new NitroRollup(createProviderPair(config), config, 300);
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
      file: 'NitroVerifier',
      args: [
        [ccip.endpoint],
        rollup.defaultWindow,
        hooks,
        rollup.Rollup,
        rollup.minAgeBlocks,
      ],
      libs: { GatewayVM },
    });
    await setupTests(verifier, {
      // https://arbiscan.io/address/0xCC344B12fcc8512cc5639CeD6556064a8907c8a1#code
      slotDataContract: '0xCC344B12fcc8512cc5639CeD6556064a8907c8a1',
    });
  }
);
