import { ethers } from 'ethers';
import { createClient, http, type Client } from 'viem';
import {
  arbitrum,
  arbitrumNova,
  arbitrumSepolia,
  base,
  baseSepolia,
  linea,
  lineaSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  polygonZkEvm,
  polygonZkEvmCardona,
  scroll,
  scrollSepolia,
  sepolia,
  taiko,
  zksync,
  zksyncSepoliaTestnet,
} from 'viem/chains';
import type { ChainId, ChainPair, ClientPair } from '../src/types.js';

const supportedChains = [
  mainnet,
  sepolia,
  optimism,
  optimismSepolia,
  base,
  baseSepolia,
  arbitrum,
  arbitrumNova,
  arbitrumSepolia,
  scroll,
  scrollSepolia,
  taiko,
  zksync,
  zksyncSepoliaTestnet,
  polygonZkEvm,
  polygonZkEvmCardona,
  linea,
  lineaSepolia,
];

export function transportUrl(chainId: ChainId): string {
  type ProviderClass = {
    getRequest(network: ethers.Network, key: string): ethers.FetchRequest;
  };
  const ordering: [string, ProviderClass][] = [
    ['INFURA_KEY', ethers.InfuraProvider],
    ['ALCHEMY_KEY', ethers.AlchemyProvider],
    ['ANKR_KEY', ethers.AnkrProvider],
  ];
  const network = ethers.Network.from(chainId);
  for (const [env, cls] of ordering) {
    const key = process.env[env];
    if (!key) continue;
    try {
      return cls.getRequest(network, key).url;
    } catch (err) {
      /*empty*/
    }
  }
  switch (chainId) {
    case mainnet.id:
      // https://developers.cloudflare.com/web3/ethereum-gateway/
      //return 'https://cloudflare-eth.com';
      // 20240713: might be better to use the ankr public rpcs
      return `https://rpc.ankr.com/eth`;
    case sepolia.id:
      return `https://rpc.ankr.com/eth_sepolia`;
    case optimism.id:
      // https://docs.optimism.io/chain/networks#op-mainnet
      return 'https://mainnet.optimism.io';
    case optimismSepolia.id:
      // https://docs.optimism.io/chain/networks#op-sepolia
      return 'https://sepolia.optimism.io';
    case base.id:
      // https://docs.base.org/docs/network-information#base-mainnet
      return 'https://mainnet.base.org';
    case baseSepolia.id:
      // https://docs.base.org/docs/network-information#base-testnet-sepolia
      return 'https://sepolia.base.org';
    case arbitrum.id:
      // https://docs.arbitrum.io/build-decentralized-apps/reference/node-providers#arbitrum-public-rpc-endpoints
      return 'https://arb1.arbitrum.io/rpc';
    case arbitrumNova.id:
      return 'https://nova.arbitrum.io/rpc';
    case arbitrumSepolia.id:
      return 'https://sepolia-rollup.arbitrum.io/rpc';
    case scroll.id:
      // https://docs.scroll.io/en/developers/developer-quickstart/#scroll-mainnet
      return 'https://rpc.scroll.io';
    case scrollSepolia.id:
      // https://docs.scroll.io/en/developers/developer-quickstart/#scroll-sepolia-testnet
      return 'https://sepolia-rpc.scroll.io';
    case taiko.id:
      // https://docs.taiko.xyz/network-reference/rpc-configuration#taiko-mainnet
      return 'https://rpc.mainnet.taiko.xyz';
    case zksync.id:
      // https://docs.zksync.io/build/connect-to-zksync#mainnet-network-details
      return 'https://mainnet.era.zksync.io';
    case zksyncSepoliaTestnet.id:
      // https://docs.zksync.io/build/connect-to-zksync#sepolia-testnet-network-details
      return 'https://sepolia.era.zksync.dev';
    case polygonZkEvm.id:
      // https://docs.polygon.technology/zkEVM/get-started/quick-start/#manually-add-network-to-wallet
      return 'https://zkevm.polygonscan.com';
    case polygonZkEvmCardona.id:
      //return 'https://cardona-zkevm.polygonscan.com/';
      return 'https://rpc.cardona.zkevm-rpc.com';
    case linea.id:
      // https://docs.linea.build/developers/quickstart/info-contracts
      return 'https://rpc.linea.build';
    case lineaSepolia.id:
      return 'https://rpc.sepolia.linea.build';
  }
  throw Object.assign(new Error('unknown provider'), { chainId });
}

export function createClientFromId(chainId: ChainId): Client {
  return createClient({
    transport: http(transportUrl(chainId), { retryCount: 0 }),
    chain: supportedChains.find((c) => c.id === chainId)!,
    cacheTime: 0,
  });
}

export function createClientPair(
  a: ChainId | ChainPair,
  b?: ChainId
): ClientPair {
  if (typeof a !== 'number') {
    b = a.chain2;
    a = a.chain1;
  }
  if (!b) {
    // if only 1 chain is provided => (mainnet, chain)
    b = a;
    a = mainnet.id;
  }
  return {
    client1: createClientFromId(a),
    client2: createClientFromId(b),
  };
}
