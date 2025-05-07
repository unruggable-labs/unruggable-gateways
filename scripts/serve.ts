import type { Serve } from 'bun';
import type { Chain, Provider } from '../src/types.js';
import type { RollupDeployment, RollupCommitType } from '../src/rollup.js';
import {
  createProviderPair,
  createProvider,
  providerURL,
  beaconURL,
} from '../test/providers.js';
import { CHAINS, chainName } from '../src/chains.js';
import { Gateway } from '../src/gateway.js';
import { type OPConfig, OPRollup } from '../src/op/OPRollup.js';
import { type OPFaultConfig, OPFaultRollup } from '../src/op/OPFaultRollup.js';
import { ReverseOPRollup } from '../src/op/ReverseOPRollup.js';
import type { ArbitrumConfig } from '../src/arbitrum/ArbitrumRollup.js';
import { NitroRollup } from '../src/arbitrum/NitroRollup.js';
import { BoLDRollup } from '../src/arbitrum/BoLDRollup.js';
import { DoubleArbitrumRollup } from '../src/arbitrum/DoubleArbitrumRollup.js';
import { type ScrollConfig, ScrollRollup } from '../src/scroll/ScrollRollup.js';
import { type EuclidConfig, EuclidRollup } from '../src/scroll/EuclidRollup.js';
import { type TaikoConfig, TaikoRollup } from '../src/taiko/TaikoRollup.js';
import { LineaRollup } from '../src/linea/LineaRollup.js';
import { LineaGatewayV1 } from '../src/linea/LineaGatewayV1.js';
import { UnfinalizedLineaRollup } from '../src/linea/UnfinalizedLineaRollup.js';
import { type ZKSyncConfig, ZKSyncRollup } from '../src/zksync/ZKSyncRollup.js';
import { PolygonPoSRollup } from '../src/polygon/PolygonPoSRollup.js';
import { EthSelfRollup } from '../src/eth/EthSelfRollup.js';
import { TrustedRollup } from '../src/TrustedRollup.js';
import { UncheckedRollup } from '../src/UncheckedRollup.js';
import { LATEST_BLOCK_TAG, toUnpaddedHex } from '../src/utils.js';
import { EthProver } from '../src/eth/EthProver.js';
//import { LineaProver } from '../src/linea/LineaProver.js';
import { ZKSyncProver } from '../src/zksync/ZKSyncProver.js';
import { Contract } from 'ethers/contract';
import { SigningKey } from 'ethers/crypto';
import { execSync } from 'child_process';

// NOTE: you can use CCIPRewriter to test an existing setup against a local gateway!
// [raffy] https://adraffy.github.io/ens-normalize.js/test/resolver.html#raffy.linea.eth.nb2hi4dthixs62dpnvss4ylooruxg5dvobuwiltdn5ws62duoryc6.ccipr.eth
// 1. bun serve lineaV1
// 2. https://adraffy.github.io/CCIPRewriter.sol/test/
// 3. enter name: "raffy.linea.eth"
// 4. enter endpoint: "http://localhost:8000"
// 5. click (Resolve)
// 6. https://adraffy.github.io/ens-normalize.js/test/resolver.html#raffy.linea.eth.nb2hi4b2f4xwy33dmfwgq33toq5dqmbqgaxq.ccipr.eth

let dumpAndExit = false;
let unfinalized = 0;
let printDebug = false;
let printCalls = false;
let prefetch = false;
let latestBlockTag = '';
let commitDepth = NaN;
let commitStep = 0;
let disableFast = false;
let disableCache = false;
let signingKey =
  process.env.SIGNING_KEY ||
  '0xbd1e630bd00f12f0810083ea3bd2be936ead3b2fa84d1bd6690c77da043e9e02'; // 0xd00d from ezccip demo
const args = process.argv.slice(2).filter((x) => {
  let match: RegExpMatchArray | null;
  if (x === '--prefetch') {
    prefetch = true;
  } else if (x === '--latest') {
    latestBlockTag = LATEST_BLOCK_TAG;
  } else if ((match = x.match(/^--unfinalized(|=\d+)$/))) {
    unfinalized = parseInt(match[1].slice(1)) | 0;
  } else if ((match = x.match(/^--depth=(\d+)$/))) {
    commitDepth = parseInt(match[1]);
  } else if ((match = x.match(/^--step=(\d+)$/))) {
    commitStep = parseInt(match[1]);
  } else if (x === '--dump') {
    dumpAndExit = true;
  } else if (x === '--debug') {
    printDebug = true;
  } else if (x === '--calls') {
    printCalls = true;
  } else if (x === '--no-fast') {
    disableFast = true;
  } else if (x === '--no-cache') {
    disableCache = true;
  } else if (/^0x[0-9a-f]{64}$/i.test(x)) {
    signingKey = x;
  } else {
    return true;
  }
  return;
});

const gateway = await createGateway(args[0]);
const port = parseInt(args[1] || process.env.PORT || '') || 8000;

if (args.length > 2) {
  throw new Error(`unknown args: ${args.join(' ')}`);
}
if (unfinalized && !gateway.rollup.unfinalized) {
  throw new Error('unfinalized not supported');
}

if (printCalls) {
  [gateway.rollup.provider1, gateway.rollup.provider2].forEach((p) => {
    p.on('debug', (x) => {
      if (x.action === 'sendRpcPayload') {
        console.log(chainName(p._network.chainId), x.action, x.payload);
      } else if (x.action == 'receiveRpcResult') {
        console.log(chainName(p._network.chainId), x.action, x.result);
      }
    });
  });
}

// how to configure gateway
if (gateway instanceof Gateway) {
  // gateway.commitDepth = 100;
  // gateway.allowHistorical = true;
  if (gateway.rollup instanceof TrustedRollup) {
    gateway.commitDepth = 0; // no need to keep expired signatures
  } else if (Number.isSafeInteger(commitDepth)) {
    gateway.commitDepth = commitDepth;
  } else if (gateway.rollup.unfinalized) {
    gateway.commitDepth = 10;
  }
}
if (latestBlockTag) {
  gateway.rollup.latestBlockTag = latestBlockTag;
}
if (disableCache) {
  gateway.disableCache();
}

// how to configure prover
gateway.rollup.configure = (c: RollupCommitType<typeof gateway.rollup>) => {
  c.prover.printDebug = printDebug;
  c.prover.fast = !disableFast;
  // c.prover.maxStackSize = 5;
  // c.prover.maxUniqueProofs = 1;
  // c.prover.maxSuppliedBytes = 256;
  // c.prover.maxEvalDepth = 0;
};

function chainDetails(provider: Provider) {
  const chain = provider._network.chainId;
  if (chain < 0) return null;
  return toJSON({
    chain,
    name: chainName(chain),
    url: concealKeys(providerURL(chain)),
  });
}

const config: Record<string, any> = {
  git: ['git describe --tags --exact-match', 'git rev-parse HEAD'].reduce(
    (version, cmd) => {
      try {
        version ||= execSync(cmd, { stdio: 'pipe' }).toString().trim();
      } catch (err) {
        // empty
      }
      return version;
    },
    ''
  ),
  gateway: gateway.constructor.name,
  rollup: gateway.rollup.constructor.name,
  unfinalized: gateway.rollup.unfinalized,
  chain1: chainDetails(gateway.rollup.provider1),
  chain2: chainDetails(gateway.rollup.provider2),
  since: new Date(),
  prefetch,
  ...toJSON(gateway),
  ...toJSON(gateway.rollup),
};

if (gateway.rollup instanceof TrustedRollup) {
  config.signer = gateway.rollup.signerAddress;
}

if (dumpAndExit) {
  console.log(config);
  const commit = await gateway.getLatestCommit();
  console.log(toJSON(commit));
  console.log(toJSON(commit.prover));
  process.exit(0);
}

if (prefetch) {
  // periodically pull the latest commit so it's always fresh
  const fire = async () => {
    try {
      await gateway.getLatestCommit();
    } finally {
      setTimeout(fire, gateway.latestCache.cacheMs);
    }
  };
  await fire();
}

console.log('Listening on', port, config);
const headers = { 'access-control-allow-origin': '*' }; // TODO: cli-option to disable cors?
export default {
  port,
  async fetch(req) {
    switch (req.method) {
      case 'OPTIONS': {
        return new Response(null, {
          headers: { ...headers, 'access-control-allow-headers': '*' },
        });
      }
      case 'GET': {
        const commit = await gateway.getLatestCommit();
        const commits = [commit];
        if (gateway instanceof Gateway) {
          for (const p of await Promise.allSettled(
            Array.from(gateway.commitCacheMap.cachedKeys(), (i) =>
              gateway.commitCacheMap.cachedValue(i)
            )
          )) {
            if (
              p.status === 'fulfilled' &&
              p.value &&
              p.value.commit !== commit
            ) {
              commits.push(p.value.commit);
            }
          }
        }
        return Response.json({
          ...config,
          prover: toJSON({
            ...commit.prover,
            block: undefined,
            batchIndex: undefined,
            cache: {
              fetches: commit.prover.cache.maxCached,
              proofs: commit.prover.proofLRU.max,
            },
          }),
          commits: commits.map((c) => ({
            ...toJSON(c),
            fetches: c.prover.cache.cachedSize,
            proofs: c.prover.proofLRU.size,
            // cache: Object.fromEntries(
            //   Array.from(c.prover.proofMap(), ([k, v]) => [
            //     k,
            //     v.map(bigintToJSON),
            //   ])
            // ),
          })),
        });
      }
      case 'POST': {
        const t0 = performance.now();
        try {
          const { sender, data: calldata } = await req.json();
          const { data, history } = await gateway.handleRead(sender, calldata, {
            protocol: 'raw',
          });
          console.log(
            new Date(),
            history.toString(),
            Math.round(performance.now() - t0)
          );
          return Response.json({ data }, { headers });
        } catch (err) {
          // flatten nested errors
          const errors = [String(err)];
          for (let e = err; e instanceof Error && e.cause; e = e.cause) {
            errors.push(String(e.cause));
          }
          const error = errors.join(' <== ');
          console.log(new Date(), error);
          return Response.json({ error }, { headers, status: 500 });
        }
      }
      default: {
        return new Response('unsupported', { status: 405 });
      }
    }
  },
} satisfies Serve;

function chainFromName(slug: string): Chain {
  if (/^(0x)?[0-9a-f]+$/i.test(slug)) return BigInt(slug);
  slug = slug.toUpperCase().replaceAll('-', '_');
  if (slug in CHAINS) return CHAINS[slug as keyof typeof CHAINS];
  throw new Error(`unknown chain: ${slug}`);
}

async function createGateway(name: string) {
  let match;
  if ((match = name.match(/^trusted:(.+)$/i))) {
    const chain = chainFromName(match[1]);
    const provider = createProvider(chain);
    const key = new SigningKey(signingKey);
    switch (chain) {
      case CHAINS.ZKSYNC:
      case CHAINS.ZKSYNC_SEPOLIA:
        return new Gateway(new TrustedRollup(provider, ZKSyncProver, key));
      // NOTE: linea should use eth_getProof instead of linea_getProof
      // NOTE: this probably needs "--latest" cli option too
      // rollup => SMT w/Mimc root using linea_getProof
      // chain => PMT w/Keccak root using eth_getProof
      // case CHAINS.LINEA:
      // case CHAINS.LINEA_SEPOLIA:
      //   return LineaProver;
      default:
        return new Gateway(new TrustedRollup(provider, EthProver, key));
    }
  } else if ((match = name.match(/^unchecked:(.+)$/i))) {
    const provider = createProvider(chainFromName(match[1]));
    return new Gateway(new UncheckedRollup(provider));
  } else if ((match = name.match(/^self:(.+)$/i))) {
    const chain = chainFromName(match[1]);
    return new Gateway(
      new EthSelfRollup(createProvider(chain), commitStep || 25) // 5 minutes (5*60/12)
    );
  } else if (name === 'reverse:op') {
    const config = ReverseOPRollup.mainnetConfig;
    return new Gateway(
      new ReverseOPRollup(createProviderPair(config), config, commitStep || 150) // 5 minutes (5*60/2)
    );
  } else if (name == 'linea:v1') {
    const config = LineaRollup.mainnetConfig;
    return new LineaGatewayV1(
      new LineaRollup(createProviderPair(config), config)
    );
  } else if (name == 'ape:L2') {
    return createArbitrum(NitroRollup.apeMainnetConfig, unfinalized);
  }
  const chain = chainFromName(name);
  switch (chain) {
    case CHAINS.OP:
      return createOPFault(OPFaultRollup.mainnetConfig, unfinalized);
    case CHAINS.OP_SEPOLIA:
      return createOPFault(OPFaultRollup.sepoliaConfig, unfinalized);
    case CHAINS.BASE:
      return createOPFault(OPFaultRollup.baseMainnetConfig, unfinalized);
    case CHAINS.BASE_SEPOLIA:
      return createOPFault(OPFaultRollup.baseSepoliaConfig, unfinalized);
    case CHAINS.UNICHAIN:
      return createOPFault(OPFaultRollup.unichainMainnetConfig, unfinalized);
    case CHAINS.UNICHAIN_SEPOLIA:
      return createOPFault(OPFaultRollup.unichainSepoliaConfig, unfinalized);
    case CHAINS.SONEIUM:
      return createOPFault(OPFaultRollup.soneiumMainnetConfig, unfinalized);
    case CHAINS.SONEIUM_SEPOLIA:
      return createOPFault(OPFaultRollup.soneiumMinatoConfig, unfinalized);
    case CHAINS.INK:
      return createOPFault(OPFaultRollup.inkMainnetConfig, unfinalized);
    case CHAINS.INK_SEPOLIA:
      return createOPFault(OPFaultRollup.inkSepoliaConfig, unfinalized);
    case CHAINS.ARB1:
      return createArbitrum(BoLDRollup.arb1MainnetConfig, unfinalized);
    case CHAINS.ARB1_SEPOLIA:
      return createArbitrum(BoLDRollup.arb1SepoliaConfig, unfinalized);
    case CHAINS.APE: {
      const config12 = BoLDRollup.arb1MainnetConfig;
      const config23 = NitroRollup.apeMainnetConfig;
      return new Gateway(
        new DoubleArbitrumRollup(
          new (config12.isBoLD ? BoLDRollup : NitroRollup)(
            createProviderPair(config12),
            config12,
            unfinalized
          ),
          createProvider(config23.chain2),
          config23
        )
      );
    }
    case CHAINS.LINEA: {
      const config = LineaRollup.mainnetConfig;
      return new Gateway(
        unfinalized
          ? new UnfinalizedLineaRollup(
              createProviderPair(config),
              config,
              unfinalized
            )
          : new LineaRollup(createProviderPair(config), config)
      );
    }
    case CHAINS.LINEA_SEPOLIA: {
      const config = LineaRollup.sepoliaConfig;
      return new Gateway(
        unfinalized
          ? new UnfinalizedLineaRollup(createProviderPair(config), config, 0)
          : new LineaRollup(createProviderPair(config), config)
      );
    }
    case CHAINS.POLYGON_POS: {
      const config = PolygonPoSRollup.mainnetConfig;
      return new Gateway(
        new PolygonPoSRollup(createProviderPair(config), config)
      );
    }
    case CHAINS.SCROLL:
      return createScroll(EuclidRollup.mainnetConfig);
    case CHAINS.SCROLL_SEPOLIA:
      return createScroll(EuclidRollup.sepoliaConfig);
    case CHAINS.TAIKO:
      return createTaiko(TaikoRollup.mainnetConfig);
    case CHAINS.TAIKO_HEKLA:
      return createTaiko(TaikoRollup.heklaConfig);
    case CHAINS.ZKSYNC:
      return createZKSync(ZKSyncRollup.mainnetConfig);
    case CHAINS.ZKSYNC_SEPOLIA:
      return createZKSync(ZKSyncRollup.sepoliaConfig);
    case CHAINS.ZERO:
      return createZKSync(ZKSyncRollup.zeroMainnetConfig);
    case CHAINS.ZERO_SEPOLIA:
      return createZKSync(ZKSyncRollup.zeroSepoliaConfig);
    case CHAINS.BLAST:
      return createOPGateway(OPRollup.blastMainnnetConfig, unfinalized);
    case CHAINS.CELO:
      return createOPFault(OPFaultRollup.celoMainnetConfig, unfinalized);
    case CHAINS.CELO_ALFAJORES:
      return createOPGateway(OPRollup.celoAlfajoresConfig, unfinalized);
    case CHAINS.CYBER:
      return createOPGateway(OPRollup.cyberMainnetConfig, unfinalized);
    case CHAINS.FRAXTAL:
      return createOPGateway(OPRollup.fraxtalMainnetConfig, unfinalized);
    case CHAINS.LISK:
      return createOPGateway(OPRollup.liskMainnetConfig, unfinalized);
    case CHAINS.LISK_SEPOLIA:
      return createOPGateway(OPRollup.liskSepoliaConfig, unfinalized);
    case CHAINS.MANTLE:
      return createOPGateway(OPRollup.mantleMainnetConfig, unfinalized);
    case CHAINS.MODE:
      return createOPGateway(OPRollup.modeMainnetConfig, unfinalized);
    case CHAINS.OP_BNB:
      return createOPGateway(OPRollup.opBNBMainnetConfig, unfinalized);
    case CHAINS.REDSTONE:
      return createOPGateway(OPRollup.redstoneMainnetConfig, unfinalized);
    case CHAINS.SHAPE:
      return createOPGateway(OPRollup.shapeMainnetConfig, unfinalized);
    case CHAINS.ZIRCUIT:
      return createOPGateway(OPRollup.zircuitMainnetConfig, unfinalized);
    case CHAINS.ZIRCUIT_SEPOLIA:
      return createOPGateway(OPRollup.zircuitSepoliaConfig, unfinalized);
    case CHAINS.ZORA:
      return createOPGateway(OPRollup.zoraMainnetConfig, unfinalized);
    default:
      throw new Error(`unknown gateway: ${name}`);
  }
}

function createOPGateway(
  config: RollupDeployment<OPConfig>,
  unfinalized?: number
) {
  return new Gateway(
    new OPRollup(createProviderPair(config), config, unfinalized)
  );
}

function createOPFault(
  config: RollupDeployment<OPFaultConfig>,
  unfinalized?: number
) {
  return new Gateway(
    new OPFaultRollup(createProviderPair(config), config, unfinalized)
  );
}

function createArbitrum(
  config: RollupDeployment<ArbitrumConfig>,
  unfinalized?: number
) {
  return new Gateway(
    new (config.isBoLD ? BoLDRollup : NitroRollup)(
      createProviderPair(config),
      config,
      unfinalized
    )
  );
}

function createScroll(config: RollupDeployment<ScrollConfig | EuclidConfig>) {
  if ('poseidon' in config) {
    return new Gateway(new ScrollRollup(createProviderPair(config), config));
  } else {
    return new Gateway(
      new EuclidRollup(
        createProviderPair(config),
        config,
        beaconURL(config.chain1)
      )
    );
  }
}

function createZKSync(config: RollupDeployment<ZKSyncConfig>) {
  return new Gateway(new ZKSyncRollup(createProviderPair(config), config));
}

async function createTaiko(config: RollupDeployment<TaikoConfig>) {
  return new Gateway(
    await TaikoRollup.create(createProviderPair(config), config)
  );
}

function toJSON(x: object) {
  const info: Record<string, any> = {};
  for (const [k, v] of Object.entries(x)) {
    if (v instanceof Contract) {
      info[k] = v.target;
    } else {
      switch (typeof v) {
        case 'bigint': {
          info[k] = bigintToJSON(v);
          break;
        }
        case 'string': {
          info[k] = concealKeys(v);
          break;
        }
        case 'boolean':
        case 'number':
          info[k] = v;
          break;
      }
    }
  }
  return info;
}

function bigintToJSON(x: bigint) {
  const i = Number(x);
  return Number.isSafeInteger(i) ? i : toUnpaddedHex(x);
}

function concealKeys(s: string) {
  if (!s.startsWith('0x')) {
    for (const [k, v] of Object.entries(process.env)) {
      if (v && k.endsWith('_KEY')) {
        s = s.replace(v, `{${k}}`);
      }
    }
  }
  return s;
}
