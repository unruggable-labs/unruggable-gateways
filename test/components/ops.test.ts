import type { KeyOf } from '../../src/types.js';
import { GatewayProgram, GatewayRequest, pow256 } from '../../src/vm.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { Foundry } from '@adraffy/blocksmith';
import { id as keccakStr } from 'ethers/hash';
import { randomBytes } from 'ethers/crypto';
import { hexlify, dataSlice, toUtf8Bytes, concat } from 'ethers/utils';
import { toPaddedHex } from '../../src/utils.js';
import { afterAll, expect, test } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

function rngUint(n = 32) {
  return BigInt(hexlify(randomBytes(n)));
}
function utf8Hex(s: string) {
  return hexlify(toUtf8Bytes(s));
}
function toPaddedArray(v: Parameters<typeof toPaddedHex>[0][]) {
  return v.map((x) => toPaddedHex(x));
}

describe('ops', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);
  const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
  const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
  const verifier = await foundry.deploy({
    file: 'SelfVerifier',
    args: [[], 0, hooks],
    libs: { GatewayVM },
  });
  const contract = await foundry.deploy(`
    contract X {
      uint256 value1 = 1;
      uint256 value2 = 2;
      string small = "abc";
      string big = "${'abc'.repeat(20)}";
      uint96[] array = [1, 2, 3];
      string[] names = ["abc", "raffy", "chonk"];
      mapping (string => string) map;
      constructor() {
        map["raffy"] = "raffy";
      }
    }
  `);

  async function verify(req: GatewayRequest) {
    const prover = await EthProver.latest(foundry.provider);
    const stateRoot = await prover.fetchStateRoot();
    const state = await prover.evalRequest(req);
    const [proofSeq, values, stack] = await Promise.all([
      prover.prove(state.needs),
      state.resolveOutputs(),
      state.resolveStack(),
    ]);
    const res = await verifier.verify(
      req.toTuple(),
      stateRoot,
      proofSeq.proofs,
      proofSeq.order
    );
    expect(res.outputs.toArray(), 'outputs').toEqual(values);
    expect(res.exitCode, 'exitCode').toEqual(BigInt(state.exitCode));
    return { ...state, values, stack, proofSeq };
  }

  function testRepeat(label: string, fn: () => Promise<void>, n = 10) {
    test(`${label} x${n}`, async () => {
      for (let i = 0; i < n; i++) {
        await fn();
      }
    });
  }

  test('setOutput', async () => {
    const req = new GatewayRequest(1).push(1).setOutput(0);
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(1));
  });

  test('setOutput: overflow', async () => {
    const req = new GatewayRequest().push(1).setOutput(0);
    expect(verify(req)).rejects.toThrow(/invalid output index: \d+/);
  });

  test('addOutput', async () => {
    const req = new GatewayRequest().push(1).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(1));
  });

  test('setSlot', async () => {
    const req = new GatewayRequest().push(123).slot().getSlot().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(123));
  });

  test('addSlot', async () => {
    const req = new GatewayRequest().push(123).addSlot().getSlot().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(123));
  });

  test('stack size', async () => {
    const req = new GatewayRequest();
    req.stackSize();
    req.stackSize();
    req.stackSize();
    const { values } = await verify(req.drain(3));
    expect(values).toEqual(toPaddedArray([0, 1, 2]));
  });

  test('length', async () => {
    const req = new GatewayRequest();
    req.push(1).length();
    req.pushStr('chonk').length();
    req.pushBytes('0xABCD').length();
    const { values } = await verify(req.drain(3));
    expect(values).toEqual(toPaddedArray([32, 5, 2]));
  });

  test('keccak', async () => {
    const req = new GatewayRequest();
    req.pushStr('').keccak().addOutput();
    req.pushStr('chonk').keccak().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(keccakStr(''));
    expect(values[1]).toEqual(keccakStr('chonk'));
  });

  test('slice', async () => {
    const small = '0x112233445566778899';
    const big = Uint8Array.from({ length: 500 }, (_, i) => i);
    const req = new GatewayRequest();
    req.pushBytes(small).slice(4, 3).addOutput();
    req.pushBytes(big).slice(300, 5).addOutput();
    req.pushBytes('0x').slice(0, 0).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(dataSlice(small, 4, 4 + 3));
    expect(values[1]).toEqual(hexlify(big.slice(300, 300 + 5)));
    expect(values[2]).toEqual('0x');
  });

  test('slice extend', async () => {
    const req = new GatewayRequest()
      .pushBytes('0x1234')
      .slice(0, 4)
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual('0x12340000');
  });

  test('push(0).slice(0, 1000)', async () => {
    const req = new GatewayRequest().push(0).slice(0, 1000).addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([hexlify(new Uint8Array(1000))]);
  });

  test('concat ints', async () => {
    const req = new GatewayRequest().push(1).push(2).concat().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(concat([toPaddedHex(1), toPaddedHex(2)]));
  });

  test('concat string x2', async () => {
    const req = new GatewayRequest();
    req.pushStr('r').pushStr('af').pushStr('fy');
    req.concat().concat().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(utf8Hex('raffy'));
  });

  test('chunk(0)', async () => {
    const req = new GatewayRequest();
    req.pushBytes('0x0102030405').chunk(0);
    req.stackSize().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toEqual(toPaddedHex(0));
  });

  test('chunk(1)', async () => {
    const req = new GatewayRequest();
    req.pushBytes('0x0102030405').chunk(1);
    const { values } = await verify(req.drain(5));
    expect(values).toEqual(['0x05', '0x04', '0x03', '0x02', '0x01']);
  });

  test('chunk(2)', async () => {
    const req = new GatewayRequest();
    req.pushBytes('0x0102030405').chunk(2);
    const { values } = await verify(req.drain(2));
    expect(values).toEqual(['0x0304', '0x0102']);
  });

  function testBinary(
    op: KeyOf<GatewayRequest, () => GatewayRequest>,
    fn: (a: bigint, b: bigint) => bigint
  ) {
    testRepeat(op, async () => {
      const a = rngUint();
      const b = rngUint();
      const req = new GatewayRequest().push(a).push(b)[op]().addOutput();
      const { values } = await verify(req);
      expect(values[0]).toEqual(toPaddedHex(fn(a, b)));
    });
  }

  testBinary('plus', (a, b) => a + b);
  testBinary('subtract', (a, b) => a - b);
  testBinary('times', (a, b) => a * b);
  testBinary('divide', (a, b) => a / b);
  testBinary('mod', (a, b) => a % b);
  testBinary('pow', pow256);
  testBinary('and', (a, b) => a & b);
  testBinary('or', (a, b) => a | b);
  testBinary('xor', (a, b) => a ^ b);
  testBinary('min', (a, b) => (a < b ? a : b));
  testBinary('max', (a, b) => (a > b ? a : b));

  function testCompare(
    op: KeyOf<GatewayRequest, () => GatewayRequest>,
    fn: (a: bigint, b: bigint) => boolean
  ) {
    test(op, async () => {
      const v = [0n, 1n, 2n];
      for (const a of v) {
        for (const b of v) {
          const req = new GatewayRequest().push(a).push(b)[op]().addOutput();
          const { values } = await verify(req);
          expect(values[0]).toEqual(toPaddedHex(fn(a, b)));
        }
      }
    });
  }

  testCompare('eq', (a, b) => a == b);
  testCompare('neq', (a, b) => a != b);
  testCompare('lt', (a, b) => a < b);
  testCompare('gt', (a, b) => a > b);
  testCompare('gte', (a, b) => a >= b);
  testCompare('lte', (a, b) => a <= b);

  test('accumulate', async () => {
    const req = new GatewayRequest();
    req.push(0);
    let sum = 0n;
    for (let i = 0; i < 1000; i++) {
      const x = rngUint();
      req.push(x).plus();
      sum += x;
    }
    req.addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([sum]));
  });

  test('plus wraps', async () => {
    const req = new GatewayRequest().push(3).push(-1).plus().addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([2]));
  });

  test('times wraps', async () => {
    const req = new GatewayRequest().push(2).push(-1).times().addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([-2]));
  });

  test('divide: by zero => error', async () => {
    const req = new GatewayRequest().push(1).push(0).divide().addOutput();
    expect(verify(req)).rejects.toThrow('divi'); // NOTE: node/bun use diff message
  });

  test('not', async () => {
    const req = new GatewayRequest().push(0).not().addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([-1]));
  });

  test('isZero', async () => {
    const req = new GatewayRequest();
    req.push(0).isZero(); // false -> true
    req.push(1).isZero(); // true -> false
    req.push(2).isZero().isZero(); // true -> false -> true
    req.pushBytes(Uint8Array.of(1)).isZero(); // false
    req.pushBytes(new Uint8Array(100)).isZero(); // true
    const { values } = await verify(req.drain(5));
    expect(values).toEqual(toPaddedArray([true, false, true, false, true]));
  });

  testRepeat('shift left', async () => {
    const x = rngUint();
    const shift = rngUint(1);
    const req = new GatewayRequest().push(x).shl(shift).addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([x << shift]));
  });

  testRepeat('shift right', async () => {
    const x = rngUint();
    const shift = rngUint(1);
    const req = new GatewayRequest().push(x).shr(shift).addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([x >> shift]));
  });

  test('cast => uint256', async () => {
    const value = '0x88';
    const req = new GatewayRequest()
      .pushBytes(value) // NOTE: not push()
      .dup()
      .addOutput()
      .push(0)
      .or() // turns bytes(0x88) into uint256(0x88)
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([value, toPaddedHex(value)]);
  });

  test('pushStack', async () => {
    const req = new GatewayRequest().push(1).pushStack(0);
    const { values } = await verify(req.drain(2));
    expect(values).toEqual(toPaddedArray([1, 1]));
  });

  test('pushStack: deep', async () => {
    const req = new GatewayRequest().push(1).push(2).push(3).pushStack(2);
    const { values } = await verify(req.drain(4));
    expect(values).toEqual(toPaddedArray([1, 2, 3, 3]));
  });

  test('pushStack: beyond => error', async () => {
    const req = new GatewayRequest().pushStack(0);
    expect(verify(req)).rejects.toThrow(/invalid stack index:/);
  });

  test('dup', async () => {
    const req = new GatewayRequest().push(1).dup();
    const { values } = await verify(req.drain(2));
    expect(values).toEqual(toPaddedArray([1, 1]));
  });

  test('dup: deep', async () => {
    const req = new GatewayRequest().push(1).push(2).push(3).dup(2);
    const { values } = await verify(req.drain(4));
    expect(values).toEqual(toPaddedArray([1, 2, 3, 1]));
  });

  test('dup: beyond => error', async () => {
    const req = new GatewayRequest().dup();
    expect(verify(req)).rejects.toThrow(/invalid stack index:/);
  });

  test('dup2', async () => {
    const req = new GatewayRequest().push(1).push(2).dup2();
    const { values } = await verify(req.drain(4));
    expect(values).toEqual(toPaddedArray([1, 2, 1, 2]));
  });

  test('swap', async () => {
    const req = new GatewayRequest().push(1).push(2).swap();
    const { values } = await verify(req.drain(2));
    expect(values).toEqual(toPaddedArray([2, 1]));
  });

  test('swap: nothing => error', async () => {
    const req = new GatewayRequest().swap();
    expect(verify(req)).rejects.toThrow(/invalid stack index:/);
  });

  test('swap: mixed', async () => {
    const req = new GatewayRequest()
      .pushStr('chonk')
      .push(1)
      .swap()
      .addOutput()
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([utf8Hex('chonk'), toPaddedHex(1)]);
  });

  test('pop', async () => {
    const req = new GatewayRequest().push(1).push(2).pop().addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([1]));
  });

  test('pop: nothing => ok', async () => {
    const req = new GatewayRequest().pop();
    await verify(req);
  });

  test('getSlot', async () => {
    const req = new GatewayRequest().setSlot(1337).getSlot().addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([1337]));
  });

  test('getTarget', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .getTarget()
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([contract.target.toLowerCase()]);
  });

  test('pushOutput', async () => {
    const req = new GatewayRequest(2)
      .push(1337)
      .setOutput(0)
      .pushOutput(0)
      .setOutput(1);
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([1337, 1337]));
  });

  test('follow', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(6)
      .pushStr('raffy')
      .follow() // map["raffy"]
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([utf8Hex('raffy')]);
  });

  test('followIndex', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(5)
      .push(1)
      .followIndex() // names[1]
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([utf8Hex('raffy')]);
  });

  test('string[]', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(5) // names
      .read() // length
      .dup()
      .addOutput()
      .push(1)
      .subtract()
      .followIndex() // names[length-1]
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([toPaddedHex(3), utf8Hex('chonk')]);
  });

  test('read', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(0)
      .read()
      .addOutput()
      .setSlot(1)
      .read()
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([1, 2]));
  });

  test('read: initial state', async () => {
    const req = new GatewayRequest().read().addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([0]));
  });

  test('read(0)', async () => {
    const req = new GatewayRequest().read(0).addOutput();
    const { values } = await verify(req);
    expect(values).toEqual(['0x']);
  });

  test('read(2)', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(0)
      .read(2)
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([concat(toPaddedArray([1, 2]))]);
  });

  test('readBytes small', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(2)
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([utf8Hex('abc')]);
  });

  test('readBytes big', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(3)
      .readBytes()
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([utf8Hex('abc'.repeat(20))]);
  });

  test('readArray', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .setSlot(4)
      .readArray(96 >> 3)
      .addOutput();
    const { values } = await verify(req);
    expect(values).toEqual([
      '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000020000000000000000000000010000000000000000000000000000000000000000000000000000000000000003',
    ]);
  });

  test('exit', async () => {
    const req = new GatewayRequest().exit(123);
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(123);
  });

  test('assertNonzero', async () => {
    const req = new GatewayRequest();
    req.push(0).assertNonzero(123);
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(123);
  });

  test('requireNonzero: zero', async () => {
    const req = new GatewayRequest();
    req.push(0).requireNonzero();
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(1);
  });

  test('requireNonzero: nonzero', async () => {
    const req = new GatewayRequest();
    req.push(1).requireNonzero();
    req.pushStr('abc').requireNonzero(2);
    req.pushBytes('0x0001').requireNonzero(3);
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(0);
  });

  test('requireContract: initial state', async () => {
    const req = new GatewayRequest().requireContract(1);
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(1);
  });

  test('requireContract: 0xDEAD', async () => {
    const req = new GatewayRequest().setTarget('0xDEAD').requireContract(1);
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(1);
  });

  test('requireContract: contract', async () => {
    const req = new GatewayRequest()
      .setTarget(contract.target)
      .requireContract();
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(0);
  });

  test('evalLoop: requireContract', async () => {
    const A = contract.target.toLowerCase();
    const req = new GatewayRequest(2);
    req.push(1); // discarded
    req.push(A); // success => stop, acquire => target = A
    req.push(0); // failure
    req.push('0xDEAD'); // failure
    req.pushProgram(new GatewayProgram().target().requireContract(1));
    req.evalLoop({ success: true, acquire: true });
    req.stackSize().setOutput(0);
    req.getTarget().setOutput(1); // out[1] = A
    const { values } = await verify(req);
    expect(values).toEqual([toPaddedHex(0), A]);
  });

  test('evalLoop: requireNonzero', async () => {
    const req = new GatewayRequest(2);
    req.push(123); // discarded
    req.push(456); // success => stop, out[1] = 456
    req.push(0); // failure
    req.pushStr(''); // failure
    req.pushProgram(new GatewayProgram().requireNonzero().setOutput(1));
    req.evalLoop({ success: true });
    req.stackSize().setOutput(0);
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([0, 456]));
  });

  test('evalLoop: beyond args', async () => {
    const req = new GatewayRequest();
    req.pushProgram(new GatewayProgram());
    req.evalLoop({ count: 1 }); // there is nothing on the stack
    await verify(req);
  });

  test('evalLoop: no args', async () => {
    const req = new GatewayRequest(1);
    req.push(123);
    req.pushProgram(new GatewayProgram().concat()); // will throw if executed
    req.evalLoop({ count: 0 }); // effectively: [].forEach(throw)
    req.setOutput(0);
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([123]));
  });

  test('evalLoop: keep', async () => {
    const req = new GatewayRequest(1);
    req.push(123);
    req.push(1); // => stop
    req.push(2); //
    req.push(3); //
    req.pushProgram(new GatewayProgram());
    req.evalLoop({ count: 3 });
    req.stackSize().setOutput(0);
    const { values } = await verify(req.drain(1));
    expect(values).toEqual(toPaddedArray([1, 123]));
  });

  test('evalLoop: failure', async () => {
    const req = new GatewayRequest(2);
    req.push(1); // discarded
    req.push(2); // discarded
    req.push(0); // failure => stop
    req.push(3); // success
    req.pushProgram(new GatewayProgram().requireNonzero().setOutput(1));
    req.evalLoop({ failure: true });
    req.stackSize().setOutput(0);
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([0, 3]));
  });

  test('evalLoop: failure + keep', async () => {
    const req = new GatewayRequest(2);
    req.push(123); // kept
    req.push(456); // kept
    req.push(0); // failure => stop
    req.push(3); // success, out[1] = 3
    req.pushProgram(new GatewayProgram().requireNonzero().setOutput(1));
    req.evalLoop({ failure: true, keep: true });
    req.stackSize().setOutput(0);
    const { values } = await verify(req.drain(2));
    expect(values).toEqual(toPaddedArray([2, 3, 123, 456]));
  });

  test('evalLoop: success', async () => {
    const req = new GatewayRequest(2);
    req.push(1); // discarded
    req.push(3); // success => stop, out[1] = 3
    req.push(0); // failure
    req.pushProgram(new GatewayProgram().requireNonzero().setOutput(1));
    req.evalLoop({ success: true });
    req.stackSize().setOutput(0);
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([0, 3]));
  });

  test('evalLoop: keep', async () => {
    const req = new GatewayRequest(2);
    req.push(123); // kept
    req.push(2); // 2 & 1 == 0 => stop
    req.push(3); // x
    req.push(5); // x
    req.push(7); // x
    req.pushProgram(
      new GatewayProgram()
        .dup() // save
        .push(1)
        .and() // isOdd
        .isZero() // isEven
        .requireNonzero()
        .pop() // input
        .setOutput(0)
    );
    req.evalLoop({ success: true, keep: true });
    req.stackSize().setOutput(1);
    const { values } = await verify(req.drain(1));
    expect(values).toEqual(toPaddedArray([2, 1, 123]));
  });

  test('evalLoop: keep + acquire', async () => {
    const req = new GatewayRequest(1);
    req.push(123); // discarded
    req.push(7 * 1 + 1); // 8 % 7 == 1
    req.push(7 * 2 + 4); // x
    req.push(7 * 3 + 5); // x
    req.push(7 * 4 + 6); // x
    req.pushProgram(
      new GatewayProgram()
        .dup() // save
        .push(7)
        .mod() // mod 7
        .push(1)
        .eq() // congruent to 1 mod 7
        .requireNonzero()
        .pop() // input
        .dup()
        .times() // x^2
    );
    req.evalLoop({ success: true, acquire: true });
    req.stackSize().setOutput(0);
    const { values } = await verify(req.drain(1));
    expect(values).toEqual(toPaddedArray([1, 8 ** 2]));
  });

  test('eval: push', async () => {
    const req = new GatewayRequest(1);
    req.push(1300);
    req.pushProgram(new GatewayProgram().push(37).plus());
    req.eval();
    req.setOutput(0);
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([1337]));
  });

  test('eval: setOutput', async () => {
    const req = new GatewayRequest(1);
    req.push(1337);
    req.pushProgram(new GatewayProgram().setOutput(0));
    req.eval();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([1337]));
  });

  test('eval: exit', async () => {
    const req = new GatewayRequest(1);
    req.push(0);
    req.pushProgram(new GatewayProgram().requireNonzero());
    req.eval();
    const { exitCode } = await verify(req);
    expect(exitCode).toEqual(1);
  });

  test('eval: conditional', async () => {
    const req = new GatewayRequest(1);
    req.push(1337);
    req.pushProgram(new GatewayProgram().concat()).push(false).evalIf();
    req.pushProgram(new GatewayProgram().setOutput(0)).push(true).evalIf();
    const { values } = await verify(req);
    expect(values).toEqual(toPaddedArray([1337]));
  });
});
