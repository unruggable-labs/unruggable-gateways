import type { Chain } from '../src/types.js';
import { CHAINS, chainName } from '../src/chains.js';
import { RPC_INFO, providerURL, providerOrder } from '../test/providers.js';

const usingPublic: Chain[] = [];
const leftover = new Set<Chain>(Object.values(CHAINS));

for (const info of RPC_INFO.values()) {
  leftover.delete(info.chain);
  const url = providerURL(info.chain);
  console.log(
    formatChain(info.chain).padStart(10),
    chainName(info.chain).padEnd(16),
    `[${info.alchemy ? 'A' : ' '}${info.infura ? 'I' : ' '}${info.ankr ? 'K' : ' '}]`,
    url === info.publicHTTP ? '!' : ' ',
    url
  );
  if (url === info.publicHTTP) {
    usingPublic.push(info.chain);
  }
}

console.log('\nOrder:', providerOrder());

if (usingPublic.length) {
  console.error(`\n${usingPublic.length} using Public RPC!`);
  console.error(usingPublic.map(chainName));
}

if (leftover.size) {
  console.error(`\n${leftover.size} missing RPCInfo!`);
  console.error(Array.from(leftover, chainName));
  process.exit(1); // fatal
}

function formatChain(chain: Chain): string {
  try {
    const s = Buffer.from(chain.toString(16), 'hex').toString('ascii');
    if (/^[A-Z_-]{3,}$/.test(s)) return s;
  } catch (_err) {
    // ignore
  }
  return chain.toString();
}
