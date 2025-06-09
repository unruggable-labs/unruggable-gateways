import { randomBytes, SigningKey } from 'ethers/crypto';
import { CHAINS } from '../../src/chains.js';
import { TrustedRollup } from '../../src/TrustedRollup.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { createProvider } from '../providers.js';

console.log(new Date());

const rollup = new TrustedRollup(
  createProvider(CHAINS.MAINNET),
  EthProver,
  new SigningKey(randomBytes(32))
);

console.log({
  signer: rollup.signerAddress,
});

// there is only 1 commit
const commit = await rollup.fetchLatestCommit();
console.log(commit);

// {
//   index: 0n,
//   stateRoot: "0x098ff4fa53a82b6af2c49e380d87b85489bffbc8c458fe81f85950ff06c4eabc",
//   signature: "0x9ae32367be138cbdab60e64ac8e060cd178386304f72f59f1e73452756af13621ed609f0586951c00146b7a222dd05d6a7c78f200ad1a974515268986efc0e481b",
//   signedAt: 1730278955,
// }
