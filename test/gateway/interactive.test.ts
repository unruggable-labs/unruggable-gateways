import { Foundry } from '@adraffy/blocksmith';
import { serve } from '@namestone/ezccip/serve';
import { describe } from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';
import { InteractiveRollup } from '../../src/InteractiveRollup.js';
import { Gateway } from '../../src/gateway.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { runSlotDataTests } from './SlotDataTests.js';
import { fetchBlock } from '../../src/utils.js';

describe('InteractiveRollup', async () => {
  const chain1 = await Foundry.launch({ infoLog: false });
  afterAll(chain1.shutdown);
  const chain2 = await Foundry.launch({
    infoLog: false,
    chain: chain1.chain + 1,
  });
  afterAll(chain2.shutdown);

  const GatewayVM = await chain1.deploy({ file: 'GatewayVM' });
  const hooks = await chain1.deploy({ file: 'EthVerifierHooks' });
  const verifier = await chain1.deploy({
    file: 'InteractiveVerifier',
    args: [[], 1000, hooks],
    libs: { GatewayVM },
  });

  const rollup = new InteractiveRollup(
    { provider1: chain1.provider, provider2: chain2.provider },
    verifier,
    EthProver
  );

  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, { protocol: 'raw', log: false });
  afterAll(ccip.shutdown);

  await verifier.setGatewayURLs([ccip.endpoint]);

  async function sync() {
    const [index, block] = await Promise.all([
      rollup.fetchLatestCommitIndex(),
      fetchBlock(chain2.provider),
    ]);
    const latest = BigInt(block.number);
    if (latest != index) {
      await chain1.confirm(verifier.setStateRoot(latest, block.stateRoot));
    }
  }

  const SlotDataContract = await chain2.deploy({ file: 'SlotDataContract' });
  const SlotDataPointer = await chain2.deploy({
    file: 'SlotDataPointer',
    args: [SlotDataContract],
  });
  const SlotDataReader = await chain1.deploy({
    file: 'SlotDataReader',
    args: [verifier, SlotDataContract, SlotDataPointer, []],
  });

  await sync();
  runSlotDataTests(SlotDataReader, { slotDataPointer: true });
});
