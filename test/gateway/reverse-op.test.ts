import { ReverseOPRollup } from '../../src/op/ReverseOPRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@namestone/ezccip/serve';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, createProviderPair } from '../providers.js';
import { fetchBlockNumber } from '../../src/utils.js';
import { setupTests, testName } from './common.js';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

const config = ReverseOPRollup.mainnetConfig;
describe.skipIf(!!process.env.IS_CV)(
  testName(config, { reverse: true }),
  async () => {
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain2),
      infoLog: false,
    });
    afterAll(foundry.shutdown);
    const rollup = new ReverseOPRollup(createProviderPair(config), config);
    // NOTE: prove against prefork block, since state diverged on our fork
    rollup.latestBlockTag = await fetchBlockNumber(foundry.provider, -5);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: false });
    afterAll(ccip.shutdown);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'ReverseOPVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, hooks, rollup.L1Block],
      libs: { GatewayVM },
    });
    await setupTests(verifier, {
      // https://etherscan.io/address/0xC9D1E777033FB8d17188475CE3D8242D1F4121D5#code
      slotDataContract: '0xC9D1E777033FB8d17188475CE3D8242D1F4121D5',
    });
  }
);
