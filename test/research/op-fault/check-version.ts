// check supported deployments for latest version support

import { chainName } from '../../../src/chains.js';
import { OPFaultConfig, OPFaultRollup } from '../../../src/op/OPFaultRollup.js';
import { createProvider } from '../../providers.js';
import { Contract } from 'ethers/contract';
import { RollupDeployment } from '../../../src/rollup.js';

console.log(new Date());

for (const x of Object.values(OPFaultRollup)) {
  if (typeof x !== 'object') continue;
  if (typeof x.chain1 !== 'bigint') continue;
  const config: RollupDeployment<OPFaultConfig> = x;

  const provider = createProvider(config.chain1);

  const asr = new Contract(
    config.AnchorStateRegistry,
    OPFaultRollup.ANCHOR_STATE_REGISTRY_ABI,
    provider
  );

  const dgf = new Contract(
    await asr.disputeGameFactory(),
    [
      `function gameCount() view returns (uint256)`,
      `function gameAtIndex(uint256) view returns (uint256 gameType, uint256 created, address gameProxy)`,
    ],
    provider
  );

  const gameCount: bigint = await dgf.gameCount();
  const [, , proxy] = await dgf.gameAtIndex(gameCount - 1n);

  console.log(
    chainName(config.chain2),
    await asr.isGameProper(proxy).catch(() => {})
  );
}

// 2025-11-15T21:28:34.048Z
// OP true
// OP_SEPOLIA true
// BASE true
// BASE_SEPOLIA true
// INK true
// INK_SEPOLIA true
// UNICHAIN true
// UNICHAIN_SEPOLIA true
// SONEIUM true
// SONEIUM_SEPOLIA true
// SWELL true
// CELO true
// CELO_SEPOLIA true
// ZORA true
