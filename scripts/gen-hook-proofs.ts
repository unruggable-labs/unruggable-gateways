// generate hook verifier proofs

import type { HexAddress, HexString32 } from '../src/types.js';
import { writeFile } from 'node:fs/promises';
import { createProvider, createProviderPair } from '../test/providers.js';
import { CHAINS } from '../src/chains.js';
import { EthProver } from '../src/eth/EthProver.js';
import { LineaRollup } from '../src/linea/LineaRollup.js';
import type { RPCZKSyncGetProof } from '../src/zksync/types.js';
import { ZKSyncRollup } from '../src/zksync/ZKSyncRollup.js';
import { toUnpaddedHex } from '../src/utils.js';

const dne = '0x000000000000000000000000000002964d3ca8ab';
const eoa = '0x51050ec063d393217B436747617aD1C2285Aeeee';

const chains = process.argv.slice(2);
if (!chains.length) {
  console.log('Supported Chains: eth, linea, zksync');
  process.exit();
}

if (chains.includes('eth')) {
  const prover = await EthProver.latest(createProvider(CHAINS.MAINNET));
  await write(
    'eth',
    prover,
    prover.blockNumber,
    await prover.fetchStateRoot(),
    {
      dne,
      eoa,
      empty: '0x805B697Da68E32d1Ab28a621B3f006F1858b2D72', // Empty
      SlotDataContract: '0xC9D1E777033FB8d17188475CE3D8242D1F4121D5',
    }
  );
}

if (chains.includes('linea')) {
  const config = LineaRollup.mainnetConfig;
  const rollup = new LineaRollup(createProviderPair(config), config);
  const commit = await rollup.fetchLatestCommit();
  await write('linea', commit.prover, commit.index, commit.stateRoot, {
    dne,
    eoa,
    empty: '0x33bbf11B1b88A01229d5D4C2D45E05ce6A0F7644', // Empty
    SlotDataContract: '0x48F5931C5Dbc2cD9218ba085ce87740157326F59',
  });
}

if (chains.includes('zksync')) {
  const config = ZKSyncRollup.mainnetConfig;
  const rollup = new ZKSyncRollup(createProviderPair(config), config);
  const commit = await rollup.fetchLatestCommit();
  await write(
    'zksync',
    {
      getProofs: async (address, slots) =>
        ({
          address,
          accountProof: await commit.prover.getAccountCodeHashProof(address),
          storageProof: await commit.prover.getStorageProofs(address, slots),
        }) satisfies RPCZKSyncGetProof & {
          accountProof: RPCZKSyncGetProof['storageProof'][number];
        },
    },
    commit.index,
    commit.stateRoot,
    {
      dne,
      eoa,
      empty: '0xB8D08ba8D91b46aF8da66c06f44B2A1633629539',
      SlotDataContract: '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc',
    }
  );
}

async function write(
  name: string,
  prover: {
    getProofs(target: HexAddress, slots: bigint[]): Promise<object>;
  },
  index: bigint,
  stateRoot: HexString32,
  accounts: {
    dne: HexAddress;
    eoa: HexAddress;
    empty: HexAddress;
    SlotDataContract: HexAddress;
  }
) {
  await writeFile(
    new URL(`../test/hooks/${name}.json`, import.meta.url),
    JSON.stringify(
      {
        date: new Date(),
        index: toUnpaddedHex(index),
        stateRoot,
        tests: Object.fromEntries(
          await Promise.all(
            Object.entries(accounts).map(async ([key, address]) => {
              const proofs = await prover.getProofs(address, [
                0n, // latest = 49
                1n, // name = "Satoshi"
                12n, // root.num = 1,
              ]);
              return [key, proofs];
            })
          )
        ),
      },
      null,
      '\t'
    )
  );
  console.log(`Wrote: ${name}`);
}
