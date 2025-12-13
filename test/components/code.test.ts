import { Foundry } from '@adraffy/blocksmith';
import { GatewayRequest } from '../../src/vm.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { afterAll, test, expect } from 'bun:test';
import { describe } from '../bun-describe-fix.js';
import { concat, dataLength, randomBytes } from 'ethers';
import { BytesLike } from 'ethers';
import { toPaddedHex } from '../../src/utils.js';
import { HexAddress } from '../../src/types.js';

describe('code', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);
  const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
  const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
  const verifier = await foundry.deploy({
    file: 'SelfVerifier',
    args: [[], 0, hooks],
    libs: { GatewayVM },
  });

  async function verify(req: GatewayRequest) {
    const prover = await EthProver.latest(foundry.provider);
    const stateRoot = await prover.fetchStateRoot();
    const vm = await prover.evalRequest(req);
    const proofSeq = await prover.prove(vm.needs);
    const values = await vm.resolveOutputs();
    const res = await verifier.verify(
      req.toTuple(),
      stateRoot,
      proofSeq.proofs,
      proofSeq.order
    );
    expect(res.outputs.toArray()).toEqual(values);
    expect(res.exitCode).toBe(BigInt(vm.exitCode));
    return { values, ...vm };
  }

  async function verifyCode(target: HexAddress) {
    const [code, { values }] = await Promise.all([
      foundry.provider.getCode(target),
      verify(new GatewayRequest().readCode(target).addOutput()),
    ]);
    expect(values[0]).toStrictEqual(code);
  }

  test('compiled code', async () => {
    const contract = await foundry.deploy(`contract C {}`);
    await verifyCode(contract.target);
  });

  // https://github.com/Vectorized/solady/blob/main/src/utils/SSTORE2.sol
  function SSTORE2(v: BytesLike) {
    return foundry.deploy(
      concat(['0x61', toPaddedHex(dataLength(v) + 1), '0x80600a3d393df300', v])
    );
  }

  test('sstore2', async () => {
    for (let i = 0; i < 10; i++) {
      const contract = await SSTORE2(randomBytes(1337));
      await verifyCode(contract.target);
    }
  });
});
