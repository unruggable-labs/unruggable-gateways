// confirm that every rpc has the correct chain id

import { CHAINS, isStarknet } from '../src/chains.js';
import { createProvider } from '../test/providers.js';

await Promise.allSettled(
  Object.entries(CHAINS).map(async ([key, chain]) => {
    if (chain < 0) return;
    try {
      const provider = createProvider(chain);
      const method = isStarknet(chain) ? 'starknet_chainId' : 'eth_chainId';
      const actual = BigInt(await provider.send(method, []));
      if (actual !== chain) throw new Error(`expected ${chain}: got ${actual}`);
    } catch (err) {
      console.error(key, String(err));
    }
  })
);