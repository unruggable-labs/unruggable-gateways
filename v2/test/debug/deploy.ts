import { ethers } from 'ethers';
import { Foundry } from '../foundry.js';

const foundry = await Foundry.launch({
  infoLog: true,
});

// await foundry.deploy({
//   sol: `
//     import "@src/EVMProver.sol";
//     contract Prover {
//       function f() external returns (bytes[] memory, uint8) {
//         EVMRequest memory r;
//         ProofSequence memory s;
//         return EVMProver.evalRequest(r, s);
//       }
//     }
//   `,
// });

await foundry.deploy({ file: 'EthSelfVerifier' });

await foundry.deploy({
  file: 'OPVerifier',
  args: [[], 0, ethers.ZeroAddress],
});
await foundry.deploy({
  file: 'OPFaultVerifier',
  args: [[], 0, ethers.ZeroAddress, ethers.ZeroAddress, 0],
});
await foundry.deploy({
  file: 'LineaVerifier',
  args: [[], 0, ethers.ZeroAddress],
  libs: { SparseMerkleProof: ethers.ZeroAddress },
});
await foundry.deploy({
  file: 'NitroVerifier',
  args: [[], 0, ethers.ZeroAddress],
});
await foundry.deploy({
  file: 'ScrollVerifier',
  args: [[], 0, ethers.ZeroAddress],
});
await foundry.deploy({
  file: 'TaikoVerifier',
  args: [[], 0, ethers.ZeroAddress],
});
await foundry.deploy({
  file: 'ZKSyncVerifier',
  args: [[], 0, ethers.ZeroAddress, ethers.ZeroAddress],
});

foundry.shutdown();
