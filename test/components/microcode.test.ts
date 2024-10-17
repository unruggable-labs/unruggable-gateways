import { GatewayRequest } from '../../src/vm.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { Foundry } from '@adraffy/blocksmith';
import { test, afterAll, expect } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

describe('microcode', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);

  async function compare(small: GatewayRequest, big: GatewayRequest) {
    const prover = await EthProver.latest(foundry.provider);
    // the requests should be different
    expect(small.ops, 'program diff').not.toEqual(big.ops);
    // small should be less ops
    expect(small.ops.length < big.ops.length, 'program size').toBeTrue();
    const vm1 = await prover.evalRequest(small);
    const vm2 = await prover.evalRequest(big);
    expect(vm1.exitCode, 'exitCode').toEqual(vm2.exitCode);
    const outputs1 = await vm1.resolveOutputs();
    const outputs2 = await vm2.resolveOutputs();
    // the outputs should be the same
    expect(outputs1, 'outputs').toEqual(outputs2);
  }

  test('x FOLLOW == x GET_SLOT CONCAT KECCAK SET_SLOT', async () => {
    const contract = await foundry.deploy(`
      contract X {
        mapping (uint256 => uint256) map;
        constructor() {
          map[1] = 2;
        }
      }
    `);
    await compare(
      new GatewayRequest()
        .setTarget(contract.target)
        .push(1)
        .follow()
        .read()
        .addOutput(),
      new GatewayRequest()
        .setTarget(contract.target)
        .push(1)
        .getSlot()
        .concat()
        .keccak()
        .slot()
        .read()
        .addOutput()
    );
  });

  test('x ADD_SLOT == x GET_SLOT PLUS SET_SLOT', async () => {
    const contract = await foundry.deploy(`
      contract X { 
        uint256 pad; 
        uint256 x = 1;
      }
	`);
    await compare(
      new GatewayRequest()
        .setTarget(contract.target)
        .push(1)
        .addSlot()
        .read()
        .addOutput(),
      new GatewayRequest()
        .setTarget(contract.target)
        .getSlot()
        .push(1)
        .plus()
        .slot()
        .read()
        .addOutput()
    );
  });

  test('x PUSH_STACK == STACK_SIZE PUSH(1) SUBTRACT PUSH(x) SUBTRACT DUP', async () => {
    await compare(
      new GatewayRequest().push(123).pushStack(0).addOutput(),
      new GatewayRequest()
        .push(123)
        .stackSize() // length
        .push(1)
        .subtract() // length - 1
        .push(0) // index = 0
        .subtract() // (length - 1) - index
        .op('DUP')
        .addOutput()
    );
  });

  test('x y DUP DUP(2) LT SWAP POP == x y DUP(1) DUP(1) GT SWAP POP', async () => {
    await compare(
      new GatewayRequest()
        .push(1)
        .push(2)
        .dup()
        .dup(2)
        .lt()
        .op('SWAP')
        .pop()
        .addOutput(),
      new GatewayRequest()
        .push(1)
        .push(2)
        .dup2()
        .gt()
        .op('SWAP')
        .pop()
        .addOutput()
    );
  });
});
