import { chainName, CHAINS } from '../../src/chains.js';
import { fetchBlock } from '../../src/utils.js';
import { createProvider } from '../providers.js';

console.log(
  Object.fromEntries(
    await Promise.all(
      [
        CHAINS.OP,
        CHAINS.BASE,
        CHAINS.CELO,
        CHAINS.ARB1,
        CHAINS.SCROLL,
        CHAINS.LINEA,
      ].map(async (chain) => {
        let ret: string | undefined;
        try {
          const provider = createProvider(chain);
          const block = await fetchBlock(provider);
          ret = block?.parentBeaconBlockRoot;
        } catch (err) {
          ret = String(err);
        }
        return [chainName(chain), ret];
      })
    )
  )
);
