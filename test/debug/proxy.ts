import { Contract, ZeroAddress } from 'ethers';
import { Foundry } from '@adraffy/blocksmith';

// export async function deployProxy(foundry: Foundry, verifier: Contract) {
//   const wallet = foundry.wallets.admin;
//   const proxy = await foundry.deploy({
//     import:
//       '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
//     args: [verifier, wallet, '0x'],
//   });
//   return new Contract(proxy.target, verifier.interface, wallet);
// }

const foundry = await Foundry.launch({ infoLog: true, procLog: true });

const ownerWallet = await foundry.ensureWallet('owner');

const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
const impl = await foundry.deploy({
  file: 'OPFaultVerifier',
  args: [[], 0, ZeroAddress, [ZeroAddress, 0, [], []]],
  libs: { GatewayVM },
  from: ownerWallet,
});

const proxy = await foundry.deploy({
  import:
    '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol',
  args: [impl, ownerWallet.address, '0x'],
  from: ownerWallet,
});

console.log(await impl.owner());
console.log(ownerWallet.address);

await foundry.confirm(impl.setGatewayURLs(['chonk.com']));
console.log(await impl.gatewayURLs());

//20241101 We don't use a proxy pattern any longer and access control means you can't interface with a verifier through a proxy.
const verifierThroughProxy = new Contract(proxy, impl.interface, ownerWallet);

await foundry.shutdown();
