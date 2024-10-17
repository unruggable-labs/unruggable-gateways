import { GatewayRequest } from '../../src/vm.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { Foundry } from '@adraffy/blocksmith';
import { hexlify, concat, dataSlice } from 'ethers/utils';
import { randomBytes } from 'ethers/crypto';
import { test, afterAll, expect } from 'bun:test';
import { toPaddedHex } from '../../src/utils.js';

test('ClowesConcatSlice', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);

  const SIZE = 73;
  const FIRST = 8;
  const LAST = 5;
  const VALUE = 1337;

  const data = hexlify(randomBytes(SIZE));
  const key = concat([dataSlice(data, 0, FIRST), dataSlice(data, -LAST)]);

  const contract = await foundry.deploy({
    sol: `
      contract C {
        bytes slot0;
        mapping (bytes => uint256) slot1;
        constructor(bytes memory data, bytes memory key, uint256 value) {
          slot0 = data;
          slot1[key] = value;
        }
      }
  `,
    args: [data, key, VALUE],
  });

  const prover = await EthProver.latest(foundry.provider);

  const req = new GatewayRequest(2)
    .setTarget(contract.target)
    .setSlot(0)
    .readBytes()
    .setOutput(0)
    .pushOutput(0)
    .slice(0, FIRST)
    .pushOutput(0)
    .slice(SIZE - LAST, LAST)
    .concat()
    .setSlot(1)
    .follow()
    .read()
    .setOutput(1);

  const values = await prover.evalRequest(req).then((r) => r.resolveOutputs());

  expect(values).toStrictEqual([data, toPaddedHex(VALUE)]);
});
