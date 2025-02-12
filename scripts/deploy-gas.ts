import { Foundry } from '@adraffy/blocksmith';
import { toPaddedHex } from '../src/utils.js';

const foundry = await Foundry.launch({ infoLog: false });

const report: Record<string, bigint> = {};
foundry.on('deploy', (c) => (report[c.__info.contract] = c.__receipt.gasUsed));

const A = toPaddedHex(1, 20);

// machine
const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });

// hooks
await foundry.deploy({ file: 'EthVerifierHooks' });
await foundry.deploy({ file: 'ScrollVerifierHooks', args: [A] });
await foundry.deploy({ file: 'ZKSyncVerifierHooks', args: [A] });
await foundry.deploy({
  file: 'LineaVerifierHooks',
  libs: { SparseMerkleProof: A },
});

// finders
await foundry.deploy({ file: 'OPFaultGameFinder' });
await foundry.deploy({ file: 'OPOutputFinder' });

// few examples
await foundry.deploy({
  file: 'NitroVerifier',
  args: [[], 0, A, A, 0],
  libs: { GatewayVM },
});
await foundry.deploy({
  file: 'OPVerifier',
  args: [[], 0, A, A, A, 0],
  libs: { GatewayVM },
});
await foundry.deploy({
  file: 'OPFaultVerifier',
  args: [[], 0, A, [A, A, 0, 0]],
  libs: { GatewayVM },
});
await foundry.deploy({
  file: 'ReverseOPVerifier',
  args: [[], 0, A, A],
  libs: { GatewayVM },
});
await foundry.deploy({
  file: 'TrustedVerifier',
  libs: { GatewayVM },
});

await foundry.shutdown();

console.log(new Date());
console.log(report);

// 2025-02-07T14:27:06.637Z
// {
//   GatewayVM: 1905202n,
//   EthVerifierHooks: 1309379n,
//   ScrollVerifierHooks: 564033n,
//   ZKSyncVerifierHooks: 323789n,
//   LineaVerifierHooks: 817863n,
//   OPFaultGameFinder: 467662n,
//   OPOutputFinder: 374663n,
//   NitroVerifier: 1732136n,
//   OPVerifier: 1090490n,
//   OPFaultVerifier: 1247548n,
//   ReverseOPVerifier: 1486839n,
//   TrustedVerifier: 1223497n,
// }
