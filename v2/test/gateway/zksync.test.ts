import { CcipReadRouter } from '@ensdomains/ccip-read-router';
import { afterAll, describe } from 'bun:test';
import type { Client } from 'viem';
import { Gateway } from '../../src/gateway.js';
import type { ZKSyncClient } from '../../src/zksync/types.js';
import { ZKSyncRollup } from '../../src/zksync/ZKSyncRollup.js';
import { Foundry } from '../foundry.js';
import { createClientPair, transportUrl } from '../providers.js';
import { runSlotDataTests } from './tests.js';

describe('zksync', async () => {
  const config = ZKSyncRollup.mainnetConfig;
  const rollup = new ZKSyncRollup(
    createClientPair(config) as { client1: Client; client2: ZKSyncClient },
    config
  );
  const foundry = await Foundry.launch({
    fork: transportUrl(config.chain1),
    infoLog: false,
    infiniteCallGas: true, // Blake2s is ~12m gas per proof!
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const router = CcipReadRouter();
  gateway.register(router);

  const server = Bun.serve(router);

  afterAll(() => server.stop());
  const smt = await foundry.deploy({
    file: 'ZKSyncSMT',
  });
  const verifier = await foundry.deploy({
    file: 'ZKSyncVerifier',
    args: [
      [`http://${server.hostname}:${server.port}`],
      rollup.defaultWindow,
      rollup.diamondProxy.address,
      smt,
    ],
  });
  // https://explorer.zksync.io/address/0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc#contract
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc'],
  });
  runSlotDataTests(reader, true);
});
