import type { HexString32 } from '../../src/types.js';
import type { RPCEthGetProof } from '../../src/eth/types.js';
import { readFile } from 'node:fs/promises';
import { Foundry } from '@adraffy/blocksmith';
import { describe, afterAll, test, expect } from 'bun:test';
import { EthProver } from '../../src/eth/EthProver.js';
import { toPaddedHex } from '../../src/utils.js';
import { encodeShortString } from '../utils.js';

describe('EthVerifierHooks', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);

  const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });

  const { stateRoot, tests } = JSON.parse(
    await readFile(new URL('./eth.json', import.meta.url), {
      encoding: 'utf8',
    })
  ) as {
    stateRoot: HexString32;
    tests: Record<string, RPCEthGetProof>;
  };

  function checkEmptyAccount(proofs: RPCEthGetProof) {
    expect(EthProver.isContract(proofs), 'isContract').toStrictEqual(false);
    expect(
      hooks.verifyAccountState(
        stateRoot,
        proofs.address,
        EthProver.encodeProof(proofs.accountProof)
      ),
      'verifyAccountState'
    ).resolves.toStrictEqual(toPaddedHex(0));
  }

  test('dne', async () => checkEmptyAccount(tests['dne']));
  test('eoa', async () => checkEmptyAccount(tests['eoa']));

  test('empty', async () => {
    const proofs = tests['empty'];
    expect(EthProver.isContract(proofs), 'isContract').toStrictEqual(true);
    const storageRoot = await hooks.verifyAccountState(
      stateRoot,
      proofs.address,
      EthProver.encodeProof(proofs.accountProof)
    );
    for (const proof of proofs.storageProof) {
      expect(
        hooks.verifyStorageValue(
          storageRoot,
          proofs.address,
          proof.key,
          EthProver.encodeProof(proof.proof)
        ),
        `verifyStorageValue: ${proof.key}`
      ).resolves.toStrictEqual(toPaddedHex(0));
    }
  });

  test('SlotDataContract', async () => {
    const proofs = tests['SlotDataContract'];
    expect(EthProver.isContract(proofs), 'isContract').toStrictEqual(true);
    const storageRoot = await hooks.verifyAccountState(
      stateRoot,
      proofs.address,
      EthProver.encodeProof(proofs.accountProof)
    );

    expect(proofs.storageProof.length, 'length').toStrictEqual(3);
    checkStorage(proofs.storageProof[0], toPaddedHex(49));
    checkStorage(proofs.storageProof[1], encodeShortString('Satoshi'));
    checkStorage(proofs.storageProof[2], toPaddedHex(1));

    function checkStorage(
      proof: (typeof proofs.storageProof)[number],
      value: HexString32
    ) {
      expect(
        hooks.verifyStorageValue(
          storageRoot,
          proofs.address,
          proof.key,
          EthProver.encodeProof(proof.proof)
        ),
        `verifyStorageValue: ${proof.key}`
      ).resolves.toStrictEqual(value);
    }
  });
});
