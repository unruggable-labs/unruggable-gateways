import { afterAll, describe, expect, test } from 'bun:test';
import { ethers } from 'ethers';
import { toHex } from 'viem';
import { EthProver } from '../../src/eth/EthProver.js';
import { EVMProgram, EVMRequest, solidityFollowSlot } from '../../src/vm.js';
import { Foundry } from '../foundry.js';

function hexStr(s: string) {
  return toHex(s);
}
function uint256(x: bigint | number) {
  return toHex(x, { size: 32 });
}

describe('ops', async () => {
  const foundry = await Foundry.launch({ infoLog: true });
  afterAll(() => foundry.shutdown());
  const verifier = await foundry.deploy({
    file: 'EthSelfVerifier',
  });
  const contract = await foundry.deploy({
    sol: `
      contract X {
        uint256 value1 = 1;
        uint256 value2 = 2;
        string small = "abc";
        string big = "${'abc'.repeat(20)}";
        uint96[] array = [1, 2, 3];
      }
    `,
  });

  async function verify(req: EVMRequest) {
    const prover = await EthProver.latest(foundry.client);
    const stateRoot = await prover.fetchStateRoot();
    const vm = await prover.evalRequest(req);
    const { proofs, order } = await prover.prove(vm.needs);
    const values = await vm.resolveOutputs();
    const res = await verifier.verify(
      [Uint8Array.from(req.ops), req.inputs],
      stateRoot,
      proofs,
      order
    );
    expect(res.outputs.toArray()).toEqual(values);
    expect(res.exitCode).toBe(BigInt(vm.exitCode));
    return { values, ...vm };
  }

  test('setOutput', async () => {
    const req = new EVMRequest(1);
    req.push(1).setOutput(0);
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
  });

  test('addOutput', async () => {
    const req = new EVMRequest(0);
    req.push(1).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
  });

  test('setOutput overflow', async () => {
    const req = new EVMRequest();
    req.push(1).setOutput(0);
    expect(verify(req)).rejects.toThrow(/invalid output index: \d+/);
  });

  test('keccak', async () => {
    const req = new EVMRequest();
    req.pushStr('').keccak().addOutput();
    req.pushStr('chonk').keccak().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(ethers.id(''));
    expect(values[1]).toBe(ethers.id('chonk'));
  });

  test('slice', async () => {
    const small = '0x112233445566778899';
    const bigBytes = Uint8Array.from({ length: 500 }, (_, i) => i);
    const big = toHex(bigBytes);
    const req = new EVMRequest();
    req.pushBytes(small).slice(4, 3).addOutput();
    req.pushBytes(big).slice(300, 5).addOutput();
    req.pushBytes('0x').slice(0, 0).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(ethers.dataSlice(small, 4, 4 + 3));
    expect(values[1]).toBe(ethers.hexlify(bigBytes.slice(300, 300 + 5)));
    expect(values[2]).toBe('0x');
  });

  test('slice overflow', async () => {
    const req = new EVMRequest();
    req.pushBytes('0x1234').slice(5, 1);
    expect(verify(req)).rejects.toThrow('slice overflow');
  });

  test('concat ints', async () => {
    const req = new EVMRequest();
    req.push(1).push(2).concat().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(ethers.concat([uint256(1), uint256(2)]));
  });

  test('concat string x2', async () => {
    const req = new EVMRequest();
    req.pushStr('r').pushStr('af').pushStr('fy').concat().concat().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(hexStr('raffy'));
  });

  test('concat nothing', async () => {
    const req = new EVMRequest();
    req.concat();
    expect(verify(req)).rejects.toThrow('stack underflow');
  });

  test('dup last', async () => {
    const req = new EVMRequest();
    req.push(1).dup().addOutput().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
    expect(values[1]).toBe(uint256(1));
  });

  test('dup deep', async () => {
    const req = new EVMRequest();
    req.push(1).push(2).push(3).dup(2).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
  });

  test('dup nothing', async () => {
    const req = new EVMRequest();
    req.dup().addOutput();
    expect(verify(req)).rejects.toThrow('stack underflow');
  });

  test('pop', async () => {
    const req = new EVMRequest();
    req.push(1).push(2).pop().addOutput();
    const { values } = await verify(req);
    expect(values.length).toBe(1);
    expect(values[0]).toBe(uint256(1));
  });

  test('pop underflow is allowed', async () => {
    const req = new EVMRequest();
    req.pop().pop().pop();
    expect(verify(req)).resolves;
    //expect(verify(req)).rejects.toThrow('stack underflow');
  });

  test('pushSlot', async () => {
    const req = new EVMRequest();
    req.setSlot(1337).pushSlot().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1337));
  });

  test('pushTarget', async () => {
    const req = new EVMRequest();
    req.setTarget(contract.target).pushTarget().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(contract.target.toLowerCase());
  });

  test('pushOutput', async () => {
    const req = new EVMRequest(2);
    req.push(5).setOutput(0).pushOutput(0).setOutput(1);
    const { values } = await verify(req);
    expect(values[1]).toBe(uint256(5));
  });

  test('follow', async () => {
    const req = new EVMRequest();
    req.setSlot(1337).pushStr('raffy').follow().pushSlot().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(solidityFollowSlot(1337, hexStr('raffy'))));
  });

  test('read', async () => {
    const req = new EVMRequest();
    req
      .setTarget(contract.target)
      .setSlot(0)
      .read()
      .addOutput()
      .setSlot(1)
      .read()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
    expect(values[1]).toBe(uint256(2));
  });

  test('read no target', async () => {
    const req = new EVMRequest();
    req.read().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(0));
  });

  test('read(0)', async () => {
    const req = new EVMRequest();
    req.read(0).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe('0x');
  });

  test('read(2)', async () => {
    const req = new EVMRequest();
    req.setTarget(contract.target).setSlot(0).read(2).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(ethers.concat([uint256(1), uint256(2)]));
  });

  test('readBytes small', async () => {
    const req = new EVMRequest();
    req.setTarget(contract.target).setSlot(2).readBytes().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(hexStr('abc'));
  });

  test('readBytes big', async () => {
    const req = new EVMRequest();
    req.setTarget(contract.target).setSlot(3).readBytes().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(hexStr('abc'.repeat(20)));
  });

  test('readArray', async () => {
    const req = new EVMRequest();
    req
      .setTarget(contract.target)
      .setSlot(4)
      .readArray(96 >> 3)
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(
      '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000020000000000000000000000010000000000000000000000000000000000000000000000000000000000000003'
    );
  });

  test('requireNonzero on zero', async () => {
    const req = new EVMRequest();
    req.push(0).requireNonzero();
    const { exitCode } = await verify(req);
    expect(exitCode).toBe(1);
  });

  test('requireNonzero on non-zero', async () => {
    const req = new EVMRequest();
    req.push(1).requireNonzero();
    req.push('0x0001').requireNonzero();
    req.pushStr('abc').requireNonzero();
    const { exitCode } = await verify(req);
    expect(exitCode).toBe(0);
  });

  test('requireContract on contract', async () => {
    const req = new EVMRequest();
    req.setTarget(contract.target).requireContract();
    const { exitCode } = await verify(req);
    expect(exitCode).toBe(0);
  });

  test('requireContract on null', async () => {
    const req = new EVMRequest();
    req.setTarget(ethers.ZeroAddress).requireContract();
    const { exitCode } = await verify(req);
    expect(exitCode).toBe(1);
  });

  test('evalLoop requireContract', async () => {
    const req = new EVMRequest();
    req.push(1);
    req.pushBytes(contract.target);
    req.pushBytes('0x51050ec063d393217B436747617aD1C2285Aeeee');
    req.pushBytes(uint256(0));
    req.begin().target().requireContract().end();
    req.evalLoop({ success: true, acquire: true });
    const { target, stack } = await verify(req);
    expect(target).toBe(contract.target.toLowerCase());
    expect(stack).toHaveLength(0);
  });

  test('evalLoop requireNonzero', async () => {
    const req = new EVMRequest(1);
    req.push(123);
    req.push(1337);
    req.push(0);
    req.pushStr('');
    req.pushProgram(new EVMProgram().requireNonzero().setOutput(0));
    req.evalLoop({ success: true });
    const { values, stack } = await verify(req);
    expect(values[0]).toBe(uint256(1337));
    expect(stack).toHaveLength(0);
  });

  test('evalLoop empty', async () => {
    const req = new EVMRequest(1);
    req.pushProgram(new EVMProgram().concat()); // this will throw if executed
    req.evalLoop();
    await verify(req);
  });

  // TODO: need more eval tests
  test('eval', async () => {
    const req = new EVMRequest();
    req.pushProgram(new EVMProgram().push(1337));
    req.eval();
    req.addOutput();
    const { values } = await verify(req);
    expect(values[0]).toStrictEqual(uint256(1337));
  });
});
