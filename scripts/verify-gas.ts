import type { ChainPair, HexAddress, ProviderPair } from '../src/types.js';
import type { Rollup, RollupCommitType } from '../src/rollup.js';
import { type DeployedContract, Foundry } from '@adraffy/blocksmith';
import { beaconURL, createProvider, providerURL } from '../test/providers.js';
import { chainName } from '../src/chains.js';
import { GatewayRequest } from '../src/vm.js';
import { ABI_CODER } from '../src/utils.js';
import { EuclidRollup } from '../src/scroll/EuclidRollup.js';
import { LineaRollup } from '../src/linea/LineaRollup.js';
import { OPFaultRollup } from '../src/op/OPFaultRollup.js';
import { ZKSyncRollup } from '../src/zksync/ZKSyncRollup.js';
import { TaikoRollup } from '../src/taiko/TaikoRollup.js';

async function createEstimator<R extends Rollup>(
  verifier: DeployedContract,
  rollup: R,
  commit?: RollupCommitType<R>
) {
  commit ??= await rollup.fetchLatestCommit();
  return async (req: GatewayRequest) => {
    const state = await commit.prover.evalRequest(req);
    const values = await state.resolveOutputs();
    const proofSeq = await commit.prover.prove(state.needs);
    const witness = rollup.encodeWitness(commit, proofSeq);
    const context = ABI_CODER.encode(['uint256'], [commit.index]);
    const gas = await verifier.getStorageValues.estimateGas(
      context,
      req.toTuple(),
      witness
    );
    return { req, state, values, gas };
  };
}

type Setup = (
  launch: (
    fn: ChainPair
  ) => Promise<{ foundry: Foundry; providers: ProviderPair }>
) => Promise<{
  config: ChainPair;
  estimator: Awaited<ReturnType<typeof createEstimator>>;
  addresses: {
    USDC: HexAddress;
    SlotData: HexAddress;
  };
}>;

const setups: Setup[] = [
  async (launch) => {
    const config = OPFaultRollup.sepoliaConfig;
    const { foundry, providers } = await launch(config);
    const rollup = new OPFaultRollup(providers, config);
    const commit = await rollup.fetchLatestCommit();
    const gameFinder = await foundry.deploy({
      file: 'FixedOPFaultGameFinder',
      args: [commit.index],
    });
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'OPFaultVerifier',
      args: [
        [],
        rollup.defaultWindow,
        hooks,
        gameFinder,
        // This is the OPFaultParams struct
        [
          rollup.OptimismPortal,
          rollup.minAgeSec,
          await rollup.gameTypes(),
          rollup.allowedProposers(),
        ],
      ],
      libs: { GatewayVM },
    });

    const estimator = await createEstimator(verifier, rollup, commit);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
        SlotData: '0xf9d79d8c09d24e0C47E32778c830C545e78512CF',
      },
    };
  },
  async (launch) => {
    const config = LineaRollup.mainnetConfig;
    const { foundry, providers } = await launch(config);
    const rollup = new LineaRollup(providers, config);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({
      file: 'LineaVerifierHooks',
      libs: {
        SparseMerkleProof: config.SparseMerkleProof,
      },
    });
    const verifier = await foundry.deploy({
      file: 'LineaVerifier',
      args: [[], rollup.defaultWindow, hooks, config.L1MessageService],
      libs: { GatewayVM },
    });
    const estimator = await createEstimator(verifier, rollup);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
        SlotData: '0x48F5931C5Dbc2cD9218ba085ce87740157326F59',
      },
    };
  },
  async (launch) => {
    const config = ZKSyncRollup.mainnetConfig;
    const { foundry, providers } = await launch(config);
    const rollup = new ZKSyncRollup(providers, config);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const ZKSyncSMT = await foundry.deploy({ file: 'ZKSyncSMT' });
    const hooks = await foundry.deploy({
      file: 'ZKSyncVerifierHooks',
      args: [ZKSyncSMT],
    });
    const verifier = await foundry.deploy({
      file: 'ZKSyncVerifier',
      args: [[], rollup.defaultWindow, hooks, rollup.DiamondProxy],
      libs: { GatewayVM },
    });
    const estimator = await createEstimator(verifier, rollup);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4',
        SlotData: '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc',
      },
    };
  },
  async (launch) => {
    const config = EuclidRollup.mainnetConfig;
    const { foundry, providers } = await launch(config);
    const rollup = new EuclidRollup(
      providers,
      config,
      beaconURL(config.chain1)
    );
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'ScrollVerifier',
      args: [[], rollup.defaultWindow, hooks, rollup.ScrollChain],
      libs: { GatewayVM },
    });
    const estimator = await createEstimator(verifier, rollup);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4',
        SlotData: '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
      },
    };
  },
  async (launch) => {
    const config = TaikoRollup.mainnetConfig;
    const { foundry, providers } = await launch(config);
    const rollup = new TaikoRollup(providers, config);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'TaikoVerifier',
      args: [[], rollup.defaultWindow, hooks, rollup.TaikoL1],
      libs: { GatewayVM },
    });
    const estimator = await createEstimator(verifier, rollup);
    return {
      config,
      estimator,
      addresses: {
        USDC: '0x07d83526730c7438048D55A4fc0b850e2aaB6f0b',
        SlotData: '0xAF7f1Fa8D5DF0D9316394433E841321160408565',
      },
    };
  },
];

console.log(new Date());
const SLOT_LIKELY_ZERO = '0x'.padEnd(66, 'F');
for (const setup of setups) {
  let foundry: Foundry | undefined;
  try {
    const { config, estimator, addresses } = await setup(async (chains) => {
      foundry = await Foundry.launch({
        infoLog: false,
        fork: providerURL(chains.chain1),
      });
      return {
        foundry,
        providers: {
          provider1: foundry.provider,
          provider2: createProvider(chains.chain2),
        },
      };
    });

    // TODO: USDC is a big trie, use addresses.SlotData for a small trie
    const proveState = await estimator(new GatewayRequest());
    const proveAccount = await estimator(
      new GatewayRequest().setTarget(addresses.USDC).requireContract()
    );
    const proveOwnerReq = await estimator(
      new GatewayRequest(1)
        .setTarget(addresses.USDC)
        .requireContract()
        .setSlot(0)
        .read()
        .setOutput(0)
    );
    const proveOwner = await estimator(
      new GatewayRequest(1)
        .setTarget(addresses.USDC)
        .setSlot(0)
        .read()
        .setOutput(0)
    );
    const proveZero = await estimator(
      new GatewayRequest(1)
        .setTarget(addresses.USDC)
        .setSlot(SLOT_LIKELY_ZERO)
        .read()
        .setOutput(0)
    ).catch((err) => {
      return err.shortMessage ?? err.message ?? 'unknown error';
    });

    // if there is only 1 trie, proving storage doesn't require an account proof (eg. ZKSync)
    const accountGas =
      proveOwnerReq.gas - proveOwner.gas > 50000
        ? proveState.gas
        : proveAccount.gas;

    console.log({
      name: chainName(config.chain2),
      rollup: proveState.gas,
      account: proveAccount.gas - proveState.gas,
      storage1: proveOwner.gas - accountGas,
      storage0:
        typeof proveZero === 'string' ? proveZero : proveZero.gas - accountGas,
    });
  } catch (err) {
    console.log(err);
  }
  await foundry?.shutdown();
}

// 2025-05-05T01:37:55.434Z
// {
//   name: "OP",
//   rollup: 86523n,
//   account: 336761n,
//   storage1: 269773n,
//   storage0: 254488n,
// }
// {
//   name: "LINEA",
//   rollup: 48867n,
//   account: 1438036n,
//   storage1: 1366387n,
//   storage0: 2665522n,
// }
// {
//   name: "ZKSYNC",
//   rollup: 58892n,
//   account: 13046218n,
//   storage1: 13048766n,
//   storage0: 13054048n,
// }
// {
//   name: "SCROLL",
//   rollup: 48755n,
//   account: 293501n,
//   storage1: 275356n,
//   storage0: 227727n,
// }
// {
//   name: "TAIKO",
//   rollup: 69969n,
//   account: 293013n,
//   storage1: 306771n,
//   storage0: 261766n,
// }
