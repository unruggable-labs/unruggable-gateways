import { CcipReadRouter } from '@ensdomains/ccip-read-router';
import { afterAll, describe } from 'bun:test';
import { Gateway } from '../../src/gateway.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { Foundry } from '../foundry.js';
import { createClientPair, transportUrl } from '../providers.js';
import { runSlotDataTests } from './tests.js';

describe('op', async () => {
  const config = OPFaultRollup.mainnetConfig;
  const rollup = await OPFaultRollup.create(createClientPair(config), config);
  const foundry = await Foundry.launch({
    fork: transportUrl(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const router = CcipReadRouter();
  gateway.register(router);

  const server = Bun.serve(router);

  afterAll(() => server.stop());
  const commit = await gateway.getLatestCommit();
  const verifier = await foundry.deploy({
    // OPFaultVerifier is too slow in fork mode (30sec+)
    file: 'FixedOPFaultVerifier',
    args: [
      [`http://${server.hostname}:${server.port}`],
      rollup.defaultWindow,
      rollup.optimismPortal.address,
      rollup.gameTypeBitMask,
      commit.index,
    ],
  });
  // https://optimistic.etherscan.io/address/0xf9d79d8c09d24e0C47E32778c830C545e78512CF
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0xf9d79d8c09d24e0C47E32778c830C545e78512CF'],
  });
  runSlotDataTests(reader);
});
