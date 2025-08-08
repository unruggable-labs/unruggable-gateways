import type { Chain } from './types.js';

// https://chainlist.wtf
// https://www.superchain.eco/chains

export const CHAINS = {
  VOID: -1n,
  MAINNET: 1n,
  SEPOLIA: 11155111n,
  HOLESKY: 17000n,
  HOODI: 560048n,
  OP: 10n,
  OP_SEPOLIA: 11155420n,
  ZKSYNC: 324n,
  ZKSYNC_SEPOLIA: 300n,
  BASE: 8453n,
  BASE_SEPOLIA: 84532n,
  ARB1: 42161n,
  ARB1_SEPOLIA: 421614n,
  ARB_NOVA: 42170n,
  TAIKO: 167000n,
  TAIKO_HEKLA: 167009n,
  SCROLL: 534352n,
  SCROLL_SEPOLIA: 534351n,
  ZKEVM: 1101n,
  ZKEVM_CARDONA: 2442n,
  POLYGON_POS: 137n,
  POLYGON_AMOY: 80002n,
  LINEA: 59144n,
  LINEA_SEPOLIA: 59141n,
  FRAXTAL: 252n,
  ZORA: 7777777n,
  BLAST: 81457n,
  MANTLE: 5000n,
  MANTLE_SEPOLIA: 5003n,
  MODE: 34443n,
  MODE_SEPOLIA: 919n,
  CYBER: 7560n,
  CYBER_SEPOLIA: 111557560n,
  REDSTONE: 690n,
  GNOSIS: 100n, // L1: must verify against withdrawal signatures?
  GNOSIS_CHIADO: 10200n,
  SHAPE: 360n,
  BSC: 56n,
  OP_BNB: 204n,
  CELO: 42220n,
  CELO_ALFAJORES: 44787n,
  WORLD: 480n,
  WORLD_SEPOLIA: 4801n,
  APE: 33139n,
  ZERO: 543210n,
  ZERO_SEPOLIA: 4457845n,
  INK: 57073n,
  INK_SEPOLIA: 763373n,
  UNICHAIN: 130n,
  UNICHAIN_SEPOLIA: 1301n,
  MORPH: 2818n,
  MORPH_HOLESKY: 2810n,
  SONEIUM: 1868n,
  SONEIUM_SEPOLIA: 1946n,
  STARKNET: 0x534e5f4d41494en, // SN_MAIN
  STARKNET_SEPOLIA: 0x534e5f5345504f4c4941n, // SN_SEPOLIA
  ZIRCUIT: 48900n,
  ZIRCUIT_SEPOLIA: 48899n,
  LISK: 1135n,
  LISK_SEPOLIA: 4202n,
  ABSTRACT_SEPOLIA: 11124n,
  MINT: 185n,
  MINT_SEPOLIA: 1687n,
  SOPHON: 50104n,
  SOPHON_SEPOLIA: 531050104n,
  SWELL: 1923n,
  SWELL_SEPOLIA: 1924n,
  BOB: 60808n,
  BOB_SEPOLIA: 808813n,
} as const satisfies Record<string, Chain>;

export function chainName(chain: Chain): string {
  for (const [name, c] of Object.entries(CHAINS)) {
    if (c === chain) return name;
  }
  throw new TypeError(`unknown chain: ${chain}`);
}

export function chainFromName(slug: string): Chain {
  if (/^(0x)?[0-9a-f]+$/i.test(slug)) return BigInt(slug);
  const key = slug.toUpperCase().replaceAll('-', '_');
  if (key in CHAINS) return CHAINS[key as keyof typeof CHAINS];
  throw new Error(`unknown chain: ${slug}`);
}

// idea: chainType? chainKind?
// at the moment, the only distinction needed is address type
export function isStarknet(chain: Chain) {
  switch (chain) {
    case CHAINS.STARKNET:
    case CHAINS.STARKNET_SEPOLIA:
      return true;
  }
  return false;
}

// idea: similar to above
export function isL1(chain: Chain) {
  switch (chain) {
    case CHAINS.MAINNET:
    case CHAINS.SEPOLIA:
    case CHAINS.HOLESKY:
    case CHAINS.HOODI:
    case CHAINS.BSC:
      return true;
  }
  return false;
}
