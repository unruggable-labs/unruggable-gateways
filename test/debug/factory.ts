import { Foundry } from '@adraffy/blocksmith';
import { type TransactionReceipt } from 'ethers';

const foundry = await Foundry.launch();

const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
const factory = await foundry.deploy({
  file: 'TrustedVerifierFactory',
  libs: { GatewayVM },
});

const EthVerifierHooks = await foundry.deploy({file: 'EthVerifierHooks'});

function wrap(receipt: TransactionReceipt) {
  const [[to]] = foundry.getEventResults(receipt, 'NewTrustedVerifier');
  return foundry.attach({to, file: 'TrustedVerifier'});
}

const clone1 = await wrap(await foundry.confirm(factory.create(foundry.wallets.admin.address, EthVerifierHooks, ["A"], [], 1)));
const clone2 = await wrap(await foundry.confirm(factory.create(foundry.wallets.admin.address, EthVerifierHooks, ["B"], [], 2)));
const clone3 = await wrap(await foundry.confirm(factory.create(foundry.wallets.admin.address, EthVerifierHooks, ["C"], [], 3)));

console.log(await clone1.gatewayURLs());
console.log(await clone2.gatewayURLs());
console.log(await clone3.gatewayURLs());

await foundry.shutdown();
