import type { HexString32 } from '../../src/types.js';
import type { RPCLineaGetProof } from '../../src/linea/types.js';
import { readFile } from 'node:fs/promises';
import { Foundry } from '@adraffy/blocksmith';
import { describe, afterAll, test, expect } from 'bun:test';
import { LineaProver } from '../../src/linea/LineaProver.js';
import { toPaddedHex } from '../../src/utils.js';
import { encodeShortString } from '../utils.js';

describe('LineaVerifierHooks', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(foundry.shutdown);

  const Mimc = await foundry.deploy({ file: 'Mimc' });
  const SparseMerkleProof = await foundry.deploy({
    file: 'SparseMerkleProof',
    libs: { Mimc },
  });
  const hooks = await foundry.deploy({
    file: 'LineaVerifierHooks',
    libs: { SparseMerkleProof },
  });

  const { stateRoot, tests } = JSON.parse(
    await readFile(new URL('./linea.json', import.meta.url), {
      encoding: 'utf8',
    })
  ) as {
    stateRoot: HexString32;
    tests: Record<string, RPCLineaGetProof>;
  };

  test('dne', async () => {
    const proofs = tests['dne'];
    expect(
      LineaProver.isInclusionProof(proofs.accountProof),
      'isInclusionProof'
    ).toStrictEqual(false);
    expect(
      hooks.verifyAccountState(
        stateRoot,
        proofs.accountProof.key,
        LineaProver.encodeProof(proofs.accountProof)
      ),
      'verifyAccountState'
    ).resolves.toStrictEqual(toPaddedHex(0));
  });

  test('eoa', async () => {
    const proofs = tests['eoa'];
    expect(
      LineaProver.isInclusionProof(proofs.accountProof),
      'isInclusionProof'
    ).toStrictEqual(true);
    expect(
      hooks.verifyAccountState(
        stateRoot,
        proofs.accountProof.key,
        LineaProver.encodeProof(proofs.accountProof)
      ),
      'verifyAccountState'
    ).resolves.toStrictEqual(toPaddedHex(0));
  });

  // TODO: fix this after rollup updates
  test.skip('empty', async () => {
    const proofs = tests['empty'];
    expect(
      LineaProver.isInclusionProof(proofs.accountProof),
      'isInclusionProof'
    ).toStrictEqual(true);
    const storageRoot = await hooks.verifyAccountState(
      stateRoot,
      proofs.accountProof.key,
      LineaProver.encodeProof(proofs.accountProof)
    );
    for (const proof of proofs.storageProofs) {
      expect(
        LineaProver.isInclusionProof(proof),
        `isInclusionProof: ${proof.key}`
      ).toStrictEqual(false);
      expect(
        hooks.verifyStorageValue(
          storageRoot,
          proof.key,
          LineaProver.encodeProof(proof)
        ),
        `verifyStorageValue: ${proof.key}`
      ).resolves.toStrictEqual(toPaddedHex(0));
    }
  });

  test('SlotDataContract', async () => {
    const proofs = tests['SlotDataContract'];
    expect(
      LineaProver.isInclusionProof(proofs.accountProof),
      'isInclusionProof'
    ).toStrictEqual(true);
    const storageRoot = await hooks.verifyAccountState(
      stateRoot,
      proofs.accountProof.key,
      LineaProver.encodeProof(proofs.accountProof)
    );
    expect(proofs.storageProofs.length, 'length').toStrictEqual(3);

    check(proofs.storageProofs[0], toPaddedHex(49));
    check(proofs.storageProofs[1], encodeShortString('Satoshi'));
    check(proofs.storageProofs[2], toPaddedHex(1));

    function check(
      proof: (typeof proofs.storageProofs)[number],
      value: HexString32
    ) {
      expect(
        LineaProver.isInclusionProof(proof),
        `isInclusionProof: ${proof.key}`
      ).toStrictEqual(true);
      expect(
        hooks.verifyStorageValue(
          storageRoot,
          proofs.accountProof.key,
          proof.key,
          LineaProver.encodeProof(proof)
        ),
        `verifyStorageValue: ${proof.key}`
      ).resolves.toStrictEqual(value);
    }
  });
});
