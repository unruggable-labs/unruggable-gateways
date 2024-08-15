import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers';
import { CHAIN_MAINNET } from '../../src/chains';
import { LineaGateway } from '../../src/linea/LineaGateway';
import { describe, test, expect, afterAll } from 'bun:test';
import { ethers } from 'ethers';
import { HexString } from '@resolverworks/ezccip';

describe('linea prover', async () => {
  const config = LineaGateway.mainnetConfig;
  const gateway = new LineaGateway({
    ...createProviderPair(config),
    ...config,
  });
  const commit = await gateway.getLatestCommit();

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

  const stateRoot = await gateway.fetchStateRoot(commit.index);

  test('dne', async () => {
    const account = '0x0000000000000000000000000000000000001234';
    expect(commit.prover.isContract(account)).resolves.toBeFalse();
    const proof = await commit.prover.prove([[account, false]]);
    const storageRoot: HexString = await verifier.proveAccountState(
      stateRoot,
      account,
      proof.proofs[0]
    );
    expect(storageRoot).toEqual(ethers.ZeroHash);
  });

  test('eoa', async () => {
    const account = '0x51050ec063d393217B436747617aD1C2285Aeeee';
    expect(commit.prover.isContract(account)).resolves.toBeFalse();
    const proof = await commit.prover.prove([[account, false]]);
    const storageRoot: HexString = await verifier.proveAccountState(
      stateRoot,
      account,
      proof.proofs[0]
    );
    expect(storageRoot).toEqual(ethers.ZeroHash);
  });

  test('contract', async () => {
    const account = '0x48F5931C5Dbc2cD9218ba085ce87740157326F59';
    expect(commit.prover.isContract(account)).resolves.toBeTrue();
    const proof = await commit.prover.prove([
      [account, false],
      [account, 0n],
    ]);
    const storageRoot = await verifier.proveAccountState(
      stateRoot,
      account,
      proof.proofs[0]
    );
    expect(storageRoot).not.toEqual(ethers.ZeroHash);
    const storageValue = await verifier.proveStorageValue(
      storageRoot,
      account,
      0n,
      proof.proofs[1]
    );
    expect(storageValue).toBe(ethers.toBeHex(49, 32));
  });
});
