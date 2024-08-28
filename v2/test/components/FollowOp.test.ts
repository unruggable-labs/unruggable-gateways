import { afterAll, test } from 'bun:test';
import assert from 'node:assert/strict';
import { EthProver } from '../../src/eth/EthProver.js';
import { EVMRequest } from '../../src/vm.js';
import { Foundry } from '../foundry.js';

test('FOLLOW === PUSH_SLOT CONCAT KECCAK SLOT_ZERO SLOT_ADD', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());

  const contract = await foundry.deploy({
    sol: `
		contract X {
			mapping (uint256 => uint256) map;
			constructor() {
				map[1] = 2;
			}
		}
	`,
  });

  const prover = await EthProver.latest(foundry.client);

  const r1 = new EVMRequest()
    .setTarget(contract.target)
    .push(1)
    .follow()
    .read()
    .addOutput();
  const r2 = new EVMRequest()
    .setTarget(contract.target)
    .push(1)
    .pushSlot()
    .concat()
    .keccak()
    .zeroSlot()
    .addSlot()
    .read()
    .addOutput();

  assert.notDeepEqual(r1.ops, r2.ops);
  assert.deepEqual(
    await prover.evalRequest(r1).then((x) => x.resolveOutputs()),
    await prover.evalRequest(r2).then((x) => x.resolveOutputs())
  );
});
