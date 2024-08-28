import { afterAll, describe, expect, test } from 'bun:test';
import { ethers } from 'ethers';
import { CHAIN_MAINNET } from '../../src/chains.js';
import { ZKSyncRollup } from '../../src/zksync/ZKSyncRollup.js';
import { Foundry } from '../foundry.js';
import { createProviderPair, providerURL } from '../providers.js';

describe('ZKSyncProver', async () => {
  const config = ZKSyncRollup.mainnetConfig;
  const gateway = new ZKSyncRollup(createProviderPair(config), config);
  const commit = await gateway.fetchLatestCommit();

  const foundry = await Foundry.launch({
    fork: providerURL(CHAIN_MAINNET),
    infoLog: true,
  });
  afterAll(() => foundry.shutdown());

  const smt = await foundry.deploy({
    file: 'ZKSyncSMT',
  });
  const verifier = await foundry.deploy({
    file: 'ZKSyncSelfVerifier',
    args: [smt],
  });

  test('unused account is null', async () => {
    const account = '0x0000000000000000000000000000000000001234';
    const proof = await commit.prover.prove([[account, false]]);
    expect(proof.proofs).toStrictEqual(['0x']);
  });

  test('dne', async () => {
    const account = '0x0000000000000000000000000000000000001234';
    expect(commit.prover.isContract(account)).resolves.toBeFalse();
    const proof = await commit.prover.prove([[account, true]]);
    const stateRoot = await verifier.proveAccountState(
      commit.stateRoot,
      account,
      proof.proofs[0]
    );
    expect(stateRoot).toStrictEqual(ethers.ZeroHash);
  });

  test('eoa', async () => {
    const account = '0x51050ec063d393217B436747617aD1C2285Aeeee';
    expect(commit.prover.isContract(account)).resolves.toBeFalse();
    const proof = await commit.prover.prove([[account, true]]);
    const stateRoot = await verifier.proveAccountState(
      commit.stateRoot,
      account,
      proof.proofs[0]
    );
    expect(stateRoot).toStrictEqual(ethers.ZeroHash);
  });

  test('contract', async () => {
    const account = '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc'; // SlotDataReader
    expect(commit.prover.isContract(account)).resolves.toBeTrue();
    const proof = await commit.prover.prove([
      [account, true],
      [account, 0n],
    ]);
    const stateRoot = await verifier.proveAccountState(
      commit.stateRoot,
      account,
      proof.proofs[0]
    );
    expect(stateRoot).toStrictEqual(commit.stateRoot);
    const storageValue = await verifier.proveStorageValue(
      stateRoot,
      account,
      0n,
      proof.proofs[1]
    );
    expect(storageValue).toStrictEqual(ethers.toBeHex(49, 32));
  });
});
