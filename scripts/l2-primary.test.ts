import type { HexAddress } from '../src/types.js';
import type { Rollup, RollupDeployment } from '../src/rollup.js';
import { Foundry } from '@adraffy/blocksmith';
import {
  createProviderPair,
  providerURL,
  beaconURL,
  decideProvider,
} from '../test/providers.js';
import { describe } from '../test/bun-describe-fix.js';
import { afterAll } from 'bun:test';
import { runSlotDataTests } from '../test/gateway/SlotDataTests.js';
import { chainFromName, chainName, CHAINS } from '../src/chains.js';
import { ZeroAddress } from 'ethers/constants';
import { Gateway } from '../src/gateway.js';
import { serve } from '@namestone/ezccip/serve';
import { type OPFaultConfig, OPFaultRollup } from '../src/op/OPFaultRollup.js';
import type { ArbitrumConfig } from '../src/arbitrum/ArbitrumRollup.js';
import { BoLDRollup } from '../src/arbitrum/BoLDRollup.js';
import { type EuclidConfig, EuclidRollup } from '../src/scroll/EuclidRollup.js';
import { type LineaConfig, LineaRollup } from '../src/linea/LineaRollup.js';

type Setup = {
  config: RollupDeployment<unknown>;
  verifier: HexAddress;
  slotDataContract: HexAddress;
  slotDataPointer?: HexAddress;
  backupGateway?: string;
};

const SETUPS: Setup[] = [
  {
    config: OPFaultRollup.sepoliaConfig,
    verifier: '0x9Fc09f6683EA8E8AD0FAE3317e39e57582469707',
    slotDataContract: '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
    slotDataPointer: '0x433F956Aa4E72DA4Da098416fD07e061b23fa73F',
  },
  {
    config: OPFaultRollup.baseSepoliaConfig,
    verifier: '0x2A5C43a0AA33c6Ca184aC0eaDF0A117109C9d6AE',
    slotDataContract: '0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411',
    slotDataPointer: '0x2D70842D1a1d6413Ce44d0D5FD4AcFDc485540EA',
  },
  {
    config: BoLDRollup.arb1SepoliaConfig,
    verifier: '0x1301020A0039e46a410bE222E0413f27DAd4CEC1',
    slotDataContract: '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
    slotDataPointer: '0x433F956Aa4E72DA4Da098416fD07e061b23fa73F',
  },
  {
    config: LineaRollup.sepoliaConfig,
    verifier: '0x6AD2BbEE28e780717dF146F59c2213E0EB9CA573',
    slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
    slotDataPointer: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
  },
  {
    config: EuclidRollup.sepoliaConfig,
    verifier: '0xd126DD79133D3aaf0248E858323Cd10C04c5E43d',
    slotDataContract: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
    slotDataPointer: '0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8',
  },
  {
    config: OPFaultRollup.baseMainnetConfig,
    verifier: '0x074C93CD956B0Dd2cAc0f9F11dDA4d3893a88149',
    slotDataContract: '0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6',
    slotDataPointer: '0x972433d30b6b78C05ADf32972F7b8485C112E055',
    backupGateway: 'https://base.3668.io',
  },
  {
    config: OPFaultRollup.mainnetConfig,
    verifier: '0x7F49A74D264e48E64e76E136b2a4BA1310C3604c',
    slotDataContract: '0xf9d79d8c09d24e0C47E32778c830C545e78512CF',
    slotDataPointer: '0x19E3e95804020282246E7C30C45cC77dE70E9dc2',
    backupGateway: 'https://optimism.3668.io',
  },
  {
    config: BoLDRollup.arb1MainnetConfig,
    verifier: '0x547af78b28290D4158c1064FF092ABBcc4cbfD97',
    slotDataContract: '0xCC344B12fcc8512cc5639CeD6556064a8907c8a1',
    slotDataPointer: '0xaB6D328eB7457164Bb4C2AC27b05200B9b688ac3',
    backupGateway: 'https://arbitrum.3668.io',
  },
  {
    config: LineaRollup.mainnetConfig,
    verifier: '0x37041498CF4eE07476d2EDeAdcf82d524Aa22ce4',
    slotDataContract: '0x48F5931C5Dbc2cD9218ba085ce87740157326F59',
    slotDataPointer: '0xDeF531a66D7eA1d4E038acABF7F5D1Bd2b306891',
    backupGateway: 'https://linea.3668.io',
  },
  {
    config: EuclidRollup.mainnetConfig,
    verifier: '0xe439F14Aaf43c87e3dfBDB0A470D9EB2C7f27d93', // un
    slotDataContract: '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
    slotDataPointer: '0x28507d851729c12F193019c7b05D916D53e9Cf57',
    backupGateway: 'https://scroll.3668.io',
  },
];

const chain2 = chainFromName(process.env.C ?? '');
const useLocalGateway = !!process.env.G;
const useLocalVerifier = !!process.env.V;
const finalizationHours = parseInt(process.env.H ?? '') || 6;
const printCalls = !!process.env.P;
const useBackupGateway = !!process.env.B;

const setup = SETUPS.find((x) => x.config.chain2 === chain2);
if (!setup) throw new Error('unsupported chain');

describe(chainName(setup.config.chain2), async () => {
  const foundry = await Foundry.launch({
    fork: providerURL(setup.config.chain1),
    infoLog: true,
  });
  afterAll(foundry.shutdown);
  const { gatewayURL, verifierAddress } = await determineGateway(
    foundry,
    setup
  );
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [
      verifierAddress,
      setup.slotDataContract,
      setup.slotDataPointer ?? ZeroAddress,
      [gatewayURL],
    ],
  });
  const verifier = await foundry.attach({
    to: verifierAddress,
    file: 'AbstractVerifier',
  });

  console.log('getLatestContext:', BigInt(await verifier.getLatestContext()));
  console.log('getWindow:', BigInt(await verifier.getWindow()));
  console.log('gatewayURLs:', await verifier.gatewayURLs());

  console.log('Gateway:', gatewayURL);
  if (!useLocalVerifier) {
    console.log('Verifier:', verifier.target);
    console.log('Hooks:', await verifier.getHooks());
  }

  console.time('warmup');
  await reader.readSlot(1337, { enableCcipRead: true });
  console.timeEnd('warmup');
  runSlotDataTests(reader, setup);
});

async function determineGateway(foundry: Foundry, setup: Setup) {
  let gateway: Gateway<Rollup>;
  let gatewayURL: string;
  let verifierAddress = useLocalVerifier ? undefined : setup.verifier;
  switch (setup.config.chain2) {
    case CHAINS.OP:
    case CHAINS.OP_SEPOLIA:
    case CHAINS.BASE:
    case CHAINS.BASE_SEPOLIA: {
      const rollup = new OPFaultRollup(
        createProviderPair(setup.config),
        setup.config as unknown as OPFaultConfig,
        3600 * finalizationHours
      );
      rollup.unfinalizedRootClaimTimeoutMs = 120000;
      gateway = new Gateway(rollup);
      if (useLocalVerifier) {
        const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
        const EthVerifierHooks = await foundry.deploy({
          file: 'EthVerifierHooks',
        });
        const verifier = await foundry.deploy({
          file: 'OPFaultVerifier',
          args: [
            [],
            rollup.defaultWindow,
            EthVerifierHooks,
            [
              rollup.OptimismPortal,
              rollup.GameFinder,
              rollup.gameTypeBitMask,
              rollup.minAgeSec,
            ],
          ],
          libs: { GatewayVM },
        });
        verifierAddress = verifier.target;
      }
      break;
    }
    case CHAINS.ARB1:
    case CHAINS.ARB1_SEPOLIA: {
      const rollup = new BoLDRollup(
        createProviderPair(setup.config),
        setup.config as unknown as ArbitrumConfig,
        300 * finalizationHours
      );
      gateway = new Gateway(rollup);
      if (useLocalVerifier) {
        const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
        const EthVerifierHooks = await foundry.deploy({
          file: 'EthVerifierHooks',
        });
        const NitroVerifierLib = await foundry.deploy({
          file: 'NitroVerifierLib',
        });
        const BoLDVerifierLib = await foundry.deploy({
          file: 'BoLDVerifierLib',
        });
        const verifier = await foundry.deploy({
          file: 'ArbitrumVerifier',
          args: [
            [],
            50400, // rollup.defaultWindow,
            EthVerifierHooks,
            rollup.Rollup,
            rollup.minAgeBlocks,
            rollup.isBoLD,
          ],
          libs: { GatewayVM, NitroVerifierLib, BoLDVerifierLib },
        });
        verifierAddress = verifier.target;
      }
      break;
    }
    case CHAINS.LINEA:
    case CHAINS.LINEA_SEPOLIA: {
      const config = setup.config as unknown as LineaConfig;
      const rollup = new LineaRollup(createProviderPair(setup.config), config);
      gateway = new Gateway(rollup);
      if (useLocalVerifier) {
        const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
        const hooks = await foundry.deploy({
          file: 'LineaVerifierHooks',
          libs: { SparseMerkleProof: config.SparseMerkleProof },
        });
        const verifier = await foundry.deploy({
          file: 'LineaVerifier',
          args: [[], rollup.defaultWindow, hooks, rollup.L1MessageService],
          libs: { GatewayVM },
        });
        verifierAddress = verifier.target;
      }
      break;
    }
    case CHAINS.SCROLL:
    case CHAINS.SCROLL_SEPOLIA: {
      const rollup = new EuclidRollup(
        createProviderPair(setup.config),
        setup.config as unknown as EuclidConfig,
        beaconURL(setup.config.chain1)
      );
      gateway = new Gateway(rollup);
      if (useLocalVerifier) {
        const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
        const EthVerifierHooks = await foundry.deploy({
          file: 'EthVerifierHooks',
        });
        const verifier = await foundry.deploy({
          file: 'ScrollVerifier',
          args: [
            [],
            rollup.defaultWindow,
            EthVerifierHooks,
            rollup.ScrollChain,
          ],
          libs: { GatewayVM },
        });
        verifierAddress = verifier.target;
      }
      break;
    }
    default: {
      throw new Error(`unknown chain: ${chainName(setup.config.chain2)}`);
    }
  }
  if (!verifierAddress) {
    throw new Error(`no verifier: ${chainName(setup.config.chain2)}`);
  }

  if (printCalls) {
    [gateway.rollup.provider1, gateway.rollup.provider2].forEach((p) => {
      p.on('debug', (x) => {
        if (x.action === 'sendRpcPayload') {
          console.log(p._network.chainId, x.action, x.payload);
        } else if (x.action == 'receiveRpcResult') {
          console.log(p._network.chainId, x.action); //, x.result);
        }
      });
    });
  }

  if (useLocalGateway) {
    console.log(await gateway.getLatestCommit());
    const ccip = await serve(gateway, { protocol: 'raw', log: true });
    afterAll(ccip.shutdown);
    gatewayURL = ccip.endpoint;
  } else {
    const {
      info: { drpc },
    } = decideProvider(setup.config.chain2);
    if (!drpc) {
      throw new Error(`expected dRPC: ${chainName(setup.config.chain2)}`);
    }
    gatewayURL = `https://lb.drpc.org/gateway/unruggable?network=${drpc}`;
    if (useBackupGateway) {
      if (!setup.backupGateway) throw new Error('no backup gateway');
      gatewayURL = setup.backupGateway;
    }
  }

  return { gatewayURL, verifierAddress };
}
