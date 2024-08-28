import { afterAll, describe, expect, test } from 'bun:test';
import { ethers } from 'ethers';
import { CHAIN_MAINNET } from '../../src/chains.js';
import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { Foundry } from '../foundry.js';
import { createProviderPair, providerURL } from '../providers.js';

describe('LineaProver', async () => {
  const config = LineaRollup.mainnetConfig;
  const gateway = new LineaRollup(createProviderPair(config), config);
  const commit = await gateway.fetchLatestCommit();
  const foundry = await Foundry.launch({
    fork: providerURL(CHAIN_MAINNET),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());

  const verifier = await foundry.deploy({
    file: 'LineaSelfVerifier',
    libs: {
      SparseMerkleProof: config.SparseMerkleProof,
    },
  });

  test('dne', async () => {
    const account = '0x0000000000000000000000000000000000001234';
    expect(commit.prover.isContract(account)).resolves.toBeFalse();
    const proof = await commit.prover.prove([[account, true]]);
    const storageRoot = await verifier.proveAccountState(
      commit.stateRoot,
      account,
      proof.proofs[0]
    );
    expect(storageRoot).toStrictEqual(ethers.ZeroHash);
  });

  test('eoa', async () => {
    const account = '0x51050ec063d393217B436747617aD1C2285Aeeee';
    expect(commit.prover.isContract(account)).resolves.toBeFalse();
    const proof = await commit.prover.prove([[account, true]]);
    const storageRoot = await verifier.proveAccountState(
      commit.stateRoot,
      account,
      proof.proofs[0]
    );
    expect(storageRoot).toStrictEqual(ethers.ZeroHash);
  });

  test('contract', async () => {
    const account = '0x48F5931C5Dbc2cD9218ba085ce87740157326F59'; // SlotDataReader
    expect(commit.prover.isContract(account)).resolves.toBeTrue();
    const proof = await commit.prover.prove([
      [account, true],
      [account, 0n],
    ]);
    const storageRoot = await verifier.proveAccountState(
      commit.stateRoot,
      account,
      proof.proofs[0]
    );
    expect(storageRoot).not.toStrictEqual(ethers.ZeroHash);
    const storageValue = await verifier.proveStorageValue(
      storageRoot,
      account,
      0n,
      proof.proofs[1]
    );
    expect(storageValue).toStrictEqual(ethers.toBeHex(49, 32));
  });
});
