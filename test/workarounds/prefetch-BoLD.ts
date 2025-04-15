import { Foundry } from '@adraffy/blocksmith';
import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { Contract } from 'ethers/contract';

// unfinalized BoLD requires approximately ~150 sequential getAssertion() calls
// on the solidity side and takes about 60 seconds to execute on a paid rpc

export async function prefetchBoLD(foundry: Foundry, rollup: BoLDRollup) {
  if (!rollup.unfinalized) return;
  const commit = await rollup.fetchLatestCommit();
  const contract = rollup.Rollup.connect(foundry.provider) as Contract;
  await Promise.all(commit.assertions.map((x) => contract.getAssertion(x)));
}
