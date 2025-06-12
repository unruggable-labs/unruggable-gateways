import type { Chain } from '../../src/types.js';
import { UncheckedRollup } from '../../src/UncheckedRollup.js';
import { chainName, CHAINS } from '../../src/chains.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@namestone/ezccip/serve';
import { Foundry } from '@adraffy/blocksmith';
import { createProvider, providerURL } from '../providers.js';
import { setupTests } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

runTests(CHAINS.MAINNET);

function runTests(chain: Chain) {
  describe(`unchecked: ${chainName(chain)}`, async () => {
    const rollup = new UncheckedRollup(createProvider(chain));
    const foundry = await Foundry.launch({
      fork: providerURL(chain),
      infoLog: false,
    });
    afterAll(foundry.shutdown);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, {
      protocol: 'raw',
      log: false,
    });
    afterAll(ccip.shutdown);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'UncheckedVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'UncheckedVerifier',
      args: [[ccip.endpoint], 60, hooks],
      libs: { GatewayVM },
    });
    await setupTests(verifier, {
      slotDataContract: '0xC9D1E777033FB8d17188475CE3D8242D1F4121D5',
    });
  });
}
