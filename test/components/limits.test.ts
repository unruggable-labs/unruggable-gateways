import { GatewayProgram, GatewayRequest } from '../../src/vm.js';
import { Foundry } from '@adraffy/blocksmith';
import { keccak256 } from 'ethers/crypto';
import { EthProver } from '../../src/eth/EthProver.js';
import { afterAll, test, expect } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

describe('limits', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);
  const MAX_BYTES = 256;
  const contract = await foundry.deploy(`
    contract X {
      bytes pass = new bytes(${MAX_BYTES});
      bytes fail = new bytes(${MAX_BYTES + 1});
    }
  `);

  async function exec(prover: EthProver, req: GatewayRequest) {
    const state = await prover.evalRequest(req);
    const [proof, values] = await Promise.all([
      prover.prove(state.needs),
      state.resolveOutputs(),
    ]);
    return { state, proof, values };
  }

  test('max stack', async () => {
    const prover = await EthProver.latest(foundry.provider);
    prover.maxStackSize = 10;
    const req = new GatewayRequest();
    for (let i = 0; i < prover.maxStackSize; i++) {
      req.push(0);
    }
    await exec(prover, req);
    req.push(0); // one more
    expect(exec(prover, req)).rejects.toThrow('stack overflow');
  });

  test('max provable bytes', async () => {
    const prover = await EthProver.latest(foundry.provider);
    prover.maxUniqueProofs = 2 + Math.ceil(MAX_BYTES / 32); // account + length + slots
    const passReq = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(0)
      .readBytes();
    const failReq = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(1)
      .readBytes();
    await exec(prover, passReq);
    expect(exec(prover, failReq)).rejects.toThrow(/^too many proofs:/);
  });

  test('max supplied bytes', async () => {
    const prover = await EthProver.latest(foundry.provider);
    prover.maxUniqueProofs = 2; // account + hashed
    prover.maxSuppliedBytes = MAX_BYTES;
    const passReq = new GatewayRequest()
      .setTarget(contract.target)
      .push(keccak256(new Uint8Array(MAX_BYTES)))
      .setSlot(0)
      .readHashedBytes();
    const failReq = new GatewayRequest()
      .setTarget(contract.target)
      .push(keccak256(new Uint8Array(MAX_BYTES + 1)))
      .setSlot(1)
      .readHashedBytes();
    await exec(prover, passReq);
    expect(exec(prover, failReq)).rejects.toThrow(/^too many bytes:/);
  });

  test('max alloc bytes: single', async () => {
    const prover = await EthProver.latest(foundry.provider);
    prover.maxAllocBytes = 64;
    const req = new GatewayRequest();
    req.push(1).push(2).concat();
    await exec(prover, req);
    prover.maxAllocBytes--;
    expect(exec(prover, req)).rejects.toThrow(/^too much allocation:/);
  });

  test('max alloc bytes: total', async () => {
    const prover = await EthProver.latest(foundry.provider);
    const N = 100;
    prover.maxAllocBytes = N * N;
    const req = new GatewayRequest();
    req.push(0);
    for (let i = 0; i < N; i++) req.slice(0, N);
    await exec(prover, req);
    prover.maxAllocBytes--;
    expect(exec(prover, req)).rejects.toThrow(/^too much allocation:/);
  });

  test('max proofs', async () => {
    const prover = await EthProver.latest(foundry.provider);
    prover.maxUniqueProofs = 10;
    const req = new GatewayRequest();
    req.setTarget(contract.target); // account is 1 proof, so we skip 1
    for (let i = 1; i < prover.maxUniqueProofs; i++) {
      req.setSlot(i).read().pop(); // pop prevents stack overflow
    }
    await exec(prover, req);
    req.setSlot(0).read(); // one more
    expect(exec(prover, req)).rejects.toThrow(/^too many proofs:/);
  });

  test('max eval depth', async () => {
    const prover = await EthProver.latest(foundry.provider);
    const N = (prover.maxEvalDepth = 10);
    function nest(n: number) {
      let p = new GatewayProgram().push(1).setOutput(0);
      while (n-- > 1) p = new GatewayProgram().pushProgram(p).eval();
      return new GatewayRequest(1).pushProgram(p).eval();
    }
    await exec(prover, nest(N));
    expect(exec(prover, nest(N + 1))).rejects.toThrow('max eval depth');
  });
});
