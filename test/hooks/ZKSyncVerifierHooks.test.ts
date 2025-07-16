import type { HexString32 } from '../../src/types.js';
import type { RPCZKSyncGetProof } from '../../src/zksync/types.js';
import { readFile } from 'node:fs/promises';
import { Foundry } from '@adraffy/blocksmith';
import { describe, afterAll, test, expect } from 'bun:test';
import { toPaddedHex } from '../../src/utils.js';
import { encodeShortString } from '../utils.js';
import { ZKSyncProver } from '../../src/index.js';

describe('ZKSyncVerifierHooks', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);

  const ZKSyncSMT = await foundry.deploy({ file: 'ZKSyncSMT' });
  const hooks = await foundry.deploy({
    file: 'ZKSyncVerifierHooks',
    args: [ZKSyncSMT],
  });

  type Proofs = RPCZKSyncGetProof & {
    accountProof: RPCZKSyncGetProof['storageProof'][number];
  };

  const { stateRoot, tests } = JSON.parse(
    await readFile(new URL('./zksync.json', import.meta.url), {
      encoding: 'utf8',
    })
  ) as {
    stateRoot: HexString32;
    tests: Record<string, Proofs>;
  };

  function checkAccount(proofs: Proofs, exists: boolean) {
    const exp = expect(
      hooks.verifyAccountState(
        stateRoot,
        proofs.address,
        ZKSyncProver.encodeProof(proofs.accountProof)
      ),
      'verifyAccountState'
    );
    (exists ? exp.not : exp).resolves.toStrictEqual(toPaddedHex(0));
  }

  function checkStorageZeros(proofs: Proofs) {
    for (const proof of proofs.storageProof) {
      expect(
        hooks.verifyStorageValue(
          stateRoot,
          proofs.address,
          proof.key,
          ZKSyncProver.encodeProof(proof)
        ),
        `verifyStorageValue: ${proof.key}`
      ).resolves.toStrictEqual(toPaddedHex(0));
    }
  }

  test('dne', async () => {
    const proofs = tests['dne'];
    checkAccount(proofs, false);
    checkStorageZeros(proofs);
  });

  test('eoa', async () => {
    const proofs = tests['eoa'];
    checkAccount(proofs, false);
    checkStorageZeros(proofs);
  });

  test('empty', async () => {
    const proofs = tests['empty'];
    checkAccount(proofs, true);
    checkStorageZeros(proofs);
  });

  test('SlotDataContract', async () => {
    const proofs = tests['SlotDataContract'];
    checkAccount(proofs, true);
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
          stateRoot,
          proofs.address,
          proof.key,
          ZKSyncProver.encodeProof(proof)
        ),
        `verifyStorageValue: ${proof.key}`
      ).resolves.toStrictEqual(value);
    }
  });
});
