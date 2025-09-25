import type { HexString } from '../../src/types.js';
import { afterAll, test, expect } from 'bun:test';
import { describe } from '../bun-describe-fix.js';
import { DeployedContract, Foundry } from '@adraffy/blocksmith';
import { serve } from '@namestone/ezccip/serve';
import { Gateway } from '../../src/gateway.js';
import { EthSelfRollup } from '../../src/eth/EthSelfRollup.js';
import { LATEST_BLOCK_TAG } from '../../src/utils.js';
import { GatewayRequest } from '../../src/vm.js';

describe('callback', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);
  const gateway = new Gateway(new EthSelfRollup(foundry.provider));
  gateway.disableCache();
  gateway.rollup.latestBlockTag = LATEST_BLOCK_TAG;
  const ccip = await serve(gateway, { protocol: 'raw', log: false });
  afterAll(ccip.shutdown);
  const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
  const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
  const verifier = await foundry.deploy({
    file: 'SelfVerifier',
    args: [[ccip.endpoint], 0, hooks],
    libs: { GatewayVM },
  });
  // const verifierOOG = await foundry.deploy({
  //   file: 'SelfVerifier',
  //   args: [
  //     [ccip.endpoint],
  //     0,
  //     await foundry.deploy(`contract H {
  //       function verifyAccountState(bytes32, address, bytes memory) external pure returns (bytes32) {
  //         while(true) {}
  //       }
  //     }`),
  //   ],
  //   libs: { GatewayVM },
  // });
  const relay = await foundry.deploy({ file: 'GatewayFetchRelay' });
  const contract = await foundry.deploy(`contract C {
     uint256 x = 1;
  }`);

  async function verify(
    verifier: DeployedContract,
    req: GatewayRequest,
    configure?: typeof gateway.rollup.configure
  ): Promise<{ values: HexString[]; exitCode: bigint }> {
    try {
      gateway.rollup.configure = configure;
      const [values, exitCode] = await relay.relay(
        verifier,
        req.toTuple(),
        [],
        { enableCcipRead: true }
      );
      return { values, exitCode };
    } finally {
      gateway.rollup.configure = undefined;
    }
  }

  test('too many proofs', async () => {
    const req = new GatewayRequest();
    req.setTarget(contract.target);
    req.setSlot(0).read().addOutput();
    await verify(verifier, req, (c) => (c.prover.maxUniqueProofs = 2));
    req.setSlot(1).read().addOutput();
    expect(
      verify(verifier, req, (c) => (c.prover.maxUniqueProofs = 2))
    ).rejects.toThrow('execution reverted: TooManyProofs(uint256)');
  });

  // test('out of gas', async () => {
  //   const req = new GatewayRequest();
  //   req.setTarget(contract.target);
  //   req.setSlot(0).read();
  //   await verify(verifierOOG, req);
  // });
});
