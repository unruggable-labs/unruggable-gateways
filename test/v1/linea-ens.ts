import { Foundry } from '@adraffy/blocksmith';
import { serve } from '@namestone/ezccip/serve';
import { Contract } from 'ethers/contract';
import { solidityPackedKeccak256 } from 'ethers/hash';
import { createProviderPair, providerURL } from '../providers.js';
import { LineaGatewayV1 } from '../../src/linea/LineaGatewayV1.js';
import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { encodeShortString } from '../utils.js';
import { toPaddedHex } from '../../src/utils.js';

// backend for linea.eth / https://names.linea.build/

const config = LineaRollup.mainnetConfig;
const rollup = new LineaRollup(createProviderPair(config), config);
const gateway = new LineaGatewayV1(rollup);
const ccip = await serve(gateway, { protocol: 'raw' });

const foundry = await Foundry.launch({
  fork: providerURL(config.chain1),
  infoLog: false,
});
const SLOT = BigInt(solidityPackedKeccak256(['uint256'], [0]));
const verifier = new Contract(
  '0x2aD1A39a3b616FB11ac5DB290061A0A5C09771f3',
  ['function gatewayURLs() external view returns (string[])'],
  foundry.provider
);
await foundry.setStorageValue(
  await verifier.getAddress(),
  toPaddedHex(SLOT),
  encodeShortString(ccip.endpoint)
);
console.log('Hijacked:', await verifier.gatewayURLs());

await resolve('raffy.linea.eth');
// await resolve('premm.linea.eth');
// await resolve('tom.linea.eth');
await resolve('_dne123.linea.eth');

async function resolve(name: string) {
  console.log();
  console.log(name);
  const resolver = await foundry.provider.getResolver(name);
  if (!resolver) throw new Error('expected resolver');
  const [address, avatar] = await Promise.all([
    resolver.getAddress(),
    resolver.getAvatar(),
  ]);
  console.log({ address, avatar });
}

await ccip.shutdown();
await foundry.shutdown();
