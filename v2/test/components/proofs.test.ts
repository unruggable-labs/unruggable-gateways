import { afterAll, describe, expect, test } from 'bun:test';
import { EthProver } from '../../src/eth/EthProver.js';
import { Foundry } from '../foundry.js';

describe('proofs', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const contract = await foundry.deploy({
    sol: `
      contract C {
        uint256 value1 = 1;
        uint256 value2 = 2;
      }
    `,
  });

  let fetchedCalls: number;
  let fetchedSlots: number;
  resetStats();
  function resetStats() {
    fetchedCalls = 0;
    fetchedSlots = 0;
  }
  foundry.emitter.on('debug', (e) => {
    if (e.action === 'sendRpcPayload' && e.payload.method === 'eth_getProof') {
      fetchedCalls++;
      fetchedSlots += e.payload.params[1].length;
    }
  });

  test('reconstruction: empty', async () => {
    const prover = await EthProver.latest(foundry.client);
    const p0 = await prover.fetchProofs(contract.target);
    const p1 = await prover.getProofs(contract.target);
    expect(p0).toEqual(p1);
  });

  test('reconstruction: 1 slot', async () => {
    const prover = await EthProver.latest(foundry.client);
    const slots = [0n];
    const p0 = await prover.fetchProofs(contract.target, slots);
    const p1 = await prover.getProofs(contract.target, slots);
    expect(p0).toEqual(p1);
  });

  test('reconstruction: 3 slot scrambled', async () => {
    const prover = await EthProver.latest(foundry.client);
    const slots = [2n, 0n, 1n];
    const p0 = await prover.fetchProofs(contract.target, slots);
    const p1 = await prover.getProofs(contract.target, slots);
    expect(p0).toEqual(p1);
  });

  test('reconstruction: batched', async () => {
    const prover = await EthProver.latest(foundry.client);
    const slots = [0n, 1n];
    const p0 = await prover.fetchProofs(contract.target, slots);
    prover.proofBatchSize = 1;
    const p1 = await prover.fetchProofs(contract.target, slots);
    expect(p0).toEqual(p1);
  });

  test('reconstruction: batched cached', async () => {
    const prover = await EthProver.latest(foundry.client);
    const slots = [0n, 1n];
    const p0 = await prover.getProofs(contract.target, slots);
    resetStats();
    prover.proofBatchSize = 1;
    const p1 = await prover.getProofs(contract.target, slots);
    expect(fetchedCalls).toBe(0);
    expect(p0).toEqual(p1);
  });

  test('fetchProofs() batch = 1', async () => {
    const prover = await EthProver.latest(foundry.client);
    resetStats();
    prover.proofBatchSize = 1;
    await prover.fetchProofs(contract.target, [0n, 1n]);
    expect(fetchedCalls).toBe(2);
  });

  test('fetchProofs() batch > 1', async () => {
    const prover = await EthProver.latest(foundry.client);
    resetStats();
    await prover.fetchProofs(contract.target, [0n, 1n]);
    expect(fetchedCalls).toBe(1);
  });

  test('getProof() 01:10', async () => {
    const prover = await EthProver.latest(foundry.client);
    resetStats();
    const [p0, p1] = await Promise.all([
      prover.getProofs(contract.target, [0n, 1n]),
      prover.getProofs(contract.target, [1n, 0n]),
    ]);
    expect(fetchedCalls).toBe(1);
    expect(fetchedSlots).toBe(2);
    expect(p0.storageProof[0]).toEqual(p1.storageProof[1]);
    expect(p0.storageProof[1]).toEqual(p1.storageProof[0]);
  });

  test('getProof() 01:12:02', async () => {
    const prover = await EthProver.latest(foundry.client);
    resetStats();
    const [p0, p1, p2] = await Promise.all([
      prover.getProofs(contract.target, [0n, 1n]),
      prover.getProofs(contract.target, [1n, 2n]),
      prover.getProofs(contract.target, [2n, 0n]),
    ]);
    expect(fetchedCalls).toBe(2);
    expect(fetchedSlots).toBe(3);
    expect(p0.storageProof[0]).toEqual(p2.storageProof[1]); // 0
    expect(p0.storageProof[1]).toEqual(p1.storageProof[0]); // 1
    expect(p1.storageProof[1]).toEqual(p2.storageProof[0]); // 2
  });

  test('getProof() 012345:012:345', async () => {
    const prover = await EthProver.latest(foundry.client);
    resetStats();
    const [p0, p1, p2] = await Promise.all([
      prover.getProofs(contract.target, [0n, 1n, 2n, 3n, 4n, 5n]),
      prover.getProofs(contract.target, [0n, 1n, 2n]),
      prover.getProofs(contract.target, [3n, 4n, 5n]),
    ]);
    expect(fetchedCalls).toBe(1);
    expect(fetchedSlots).toBe(6);
    expect(p0.storageProof).toEqual(p1.storageProof.concat(p2.storageProof));
  });
});
