import { Foundry } from '@adraffy/blocksmith';
import { CHAINS } from '../../src/chains.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { createProvider, providerURL } from '../providers.js';
import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { ZeroAddress } from 'ethers/constants';

// <empty> https://sepolia.scrollscan.com/address/0x6f390C35b8b96dfDF42281Cec36f1226eEd87c6B#code
// 1       https://sepolia.scrollscan.com/address/0xb3664493FB8414d3Dad1275aC0E8a12Ef859694d#code
// 102     https://sepolia.scrollscan.com/address/0xA9b5B77C7CCA43066d0d200e7f47b674CE93CE8C#code
// 100005  https://sepolia.scrollscan.com/address/0x4C600c1ee9c81Be765387B7659347fc036D3dE6C#code
// 102005  https://sepolia.scrollscan.com/address/0x06d349C4DdF4b6003bF3Eae0A67e6B9838E16667#code
// <100>   https://sepolia.scrollscan.com/address/0x90d2f24a9c81778713ebda7c417ec0dd30207094#code
const target = '0x90d2f24a9c81778713ebda7c417ec0dd30207094';

const provider = createProvider(CHAINS.SCROLL_SEPOLIA);
const prover = await EthProver.latest(provider);
const slots = Array.from({ length: 100 }, (_, i) => BigInt(i));
const proof = await prover.getProofs(target, slots);
console.log(proof);

const stateRoot = await prover.fetchStateRoot();
console.log({ stateRoot });

const foundry = await Foundry.launch({
  fork: providerURL(CHAINS.MAINNET),
});

const verifier = await foundry.deploy({
  file: 'ScrollVerifierHooks',
  args: [ScrollRollup.mainnetConfig.poseidon],
});

try {
  const storageRoot = await verifier.verifyAccountState(
    stateRoot,
    target,
    EthProver.encodeProof(proof.accountProof)
  );
  console.log({ storageRoot });

  for (let i = 0; i < slots.length; i++) {
    const key = BigInt(proof.storageProof[i].key);
    const value = BigInt(proof.storageProof[i].value);
    for (let j = 0; j < slots.length; j++) {
      const proved = await verifier
        .verifyStorageValue(
          storageRoot,
          ZeroAddress, // doesn't matter
          key,
          EthProver.encodeProof(proof.storageProof[j].proof)
        )
        .catch(() => null);
      if (proved) {
        if (BigInt(proved) !== value) throw new Error(`wrong ${i}x${j}`);
      } else if (i == j) {
        throw new Error(`expected ${i}`);
      }
    }
  }
} catch (err) {
  console.log(err);
}

await foundry.shutdown();
