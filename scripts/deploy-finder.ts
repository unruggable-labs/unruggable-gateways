import { FoundryDeployer } from '@adraffy/blocksmith';
import { createProvider } from '../test/providers.js';
import { chainFromName, chainName } from '../src/chains.js';

async function prompt(q: string) {
  process.stdout.write(q);
  for await (const line of console) {
    return line.trim();
  }
  return '';
}

const chain = chainFromName(await prompt(`Chain (name or id): `));
console.log(`Chain: ${chainName(chain)} (${chain})`);

const deployer = await FoundryDeployer.load({
  provider: createProvider(chain),
  privateKey: await prompt('Private Key (empty to simulate): '),
});

const deployable = await deployer.prepare({
  file: 'OPFaultGameFinder',
});

if (deployer.privateKey) {
  await prompt('Ready? (abort to stop) ');
  await deployable.deploy();
  const apiKey =
    deployer.etherscanApiKey || (await prompt('Etherscan API Key: '));
  if (apiKey) {
    await deployable.verifyEtherscan({ apiKey });
  }
}
