import type { RollupDeployment } from '../rollup.js';
import type { HexAddress, HexString32, ProviderPair } from '../types.js';
import { AbstractOPRollup, type AbstractOPCommit } from './AbstractOPRollup.js';
import { CHAINS } from '../chains.js';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { isCallException } from 'ethers';

const FINDER_ABI = new Interface([
  `error OutputNotFound()`,
  `function findOutputIndex(address portal, uint256 minAgeSec) view returns (uint256)`,
  `function getOutput(address portal, uint256 outputIndex) view returns (
    (bytes32 outputRoot, uint128 timestamp, uint128 l2BlockNumber)
   )`,
]);

export type OPConfig = {
  OptimismPortal: HexAddress; // Implementation behind OptimismPortalProxy
  OutputFinder: HexAddress;
};

export type OPCommit = AbstractOPCommit & { readonly output: ABIOutputTuple };

type ABIOutputTuple = {
  outputRoot: HexString32;
  timestamp: bigint;
  l2BlockNumber: bigint;
};

const FINDER_MAINNET = '0xFe75ecc04DB4f46762126924d21Ae3d35087c482';
const FINDER_SEPOLIA = '0x152Efe905aE77730103edD31691303025075C24D';
const FINDER_HOLESKY = '0x35FF17ae0a5ac38F66E7994401a3c304023881Ad';
const FINDER_OP_BNB = '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05';

export class OPRollup extends AbstractOPRollup<OPCommit> {
  static readonly FINDER_ABI = FINDER_ABI;

  static readonly FINDERS = new Map([
    [CHAINS.MAINNET, FINDER_MAINNET],
    [CHAINS.SEPOLIA, FINDER_SEPOLIA],
    [CHAINS.HOLESKY, FINDER_HOLESKY],
    [CHAINS.OP_BNB, FINDER_OP_BNB],
  ]);

  // 20241030: changed to fault proofs
  // https://x.com/base/status/1851672364439814529
  // https://base.mirror.xyz/eOsedW4tm8MU5OhdGK107A9wsn-aU7MAb8f3edgX5Tk
  // static readonly baseMainnetConfig: RollupDeployment<OPConfig> = {
  //   chain1: CHAINS.MAINNET,
  //   chain2: CHAINS.BASE,
  //   L2OutputOracle: '0x56315b90c40730925ec5485cf004d835058518A0',
  // };

  // 20250130: changed to fault proofs
  // https://x.com/world_chain_/status/1880364416400838733
  // https://docs.worldcoin.org/world-chain/developers/world-chain-contracts
  // static readonly worldMainnetConfig: RollupDeployment<OPConfig> = {
  //   chain1: CHAINS.MAINNET,
  //   chain2: CHAINS.WORLD,
  //   L2OutputOracle: '0x19A6d1E9034596196295CF148509796978343c5D',
  // };

  // https://docs.blast.io/building/contracts#mainnet
  static readonly blastMainnnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.BLAST,
    OptimismPortal: '0x0Ec68c5B10F21EFFb74f2A5C61DFe6b08C0Db6Cb',
    OutputFinder: FINDER_MAINNET,
  };

  // https://docs.frax.com/fraxtal/addresses/fraxtal-contracts#mainnet
  static readonly fraxtalMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.FRAXTAL,
    OptimismPortal: '0x36cb65c1967A0Fb0EEE11569C51C2f2aA1Ca6f6D',
    OutputFinder: FINDER_MAINNET,
  };

  // not sure when this changed to fault proofs
  // https://docs.zora.co/zora-network/network#zora-network-mainnet-1
  // static readonly zoraMainnetConfig: RollupDeployment<OPConfig> = {
  //   chain1: CHAINS.MAINNET,
  //   chain2: CHAINS.ZORA,
  //   OptimismPortal: '0x1a0ad011913A150f69f6A19DF447A0CfD9551054',
  // };

  // https://docs.mantle.xyz/network/system-information/on-chain-system/key-l1-contract-address
  static readonly mantleMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.MANTLE,
    OptimismPortal: '0x31d543e7BE1dA6eFDc2206Ef7822879045B9f481',
    OutputFinder: FINDER_MAINNET,
  };

  // https://docs.mode.network/general-info/mainnet-contract-addresses/l1-l2-contracts
  static readonly modeMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.MODE,
    OptimismPortal: '0xc54cb22944F2bE476E02dECfCD7e3E7d3e15A8Fb',
    OutputFinder: FINDER_MAINNET,
  };

  // https://docs.cyber.co/build-on-cyber/addresses-mainnet
  // https://docs.cyber.co/build-on-cyber/addresses-testnet
  static readonly cyberMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.CYBER,
    OptimismPortal: '0x1d59bc9fcE6B8E2B1bf86D4777289FFd83D24C99',
    OutputFinder: FINDER_MAINNET,
  };

  // https://redstone.xyz/docs/contract-addresses
  static readonly redstoneMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.REDSTONE,
    OptimismPortal: '0xa426A052f657AEEefc298b3B5c35a470e4739d69',
    OutputFinder: FINDER_MAINNET,
  };

  // https://docs.shape.network/documentation/technical-details/contract-addresses#mainnet
  static readonly shapeMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.SHAPE,
    OptimismPortal: '0xEB06fFa16011B5628BaB98E29776361c83741dd3',
    OutputFinder: FINDER_MAINNET,
  };

  // https://docs.bnbchain.org/bnb-opbnb/core-concepts/opbnb-protocol-addresses/
  static readonly opBNBMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.BSC,
    chain2: CHAINS.OP_BNB,
    OptimismPortal: '0x4386C8ABf2009aC0c263462Da568DD9d46e52a31',
    OutputFinder: FINDER_MAINNET,
  };

  // shutdown March 26, 2025, 3:00 AM UTC at block 31_056_500
  // https://forum.celo.org/t/alfajores-goes-l2/9052
  // https://storage.googleapis.com/cel2-rollup-files/alfajores/deployment-l1.json
  // static readonly celoAlfajoresConfig: RollupDeployment<OPConfig> = {
  //   chain1: CHAINS.HOLESKY,
  //   chain2: CHAINS.CELO_ALFAJORES,
  //   OptimismPortal: '0x82527353927d8D069b3B452904c942dA149BA381',
  //   OutputFinder: FINDER_HOLESKY,
  // };

  // https://docs.worldcoin.org/world-chain/developers/world-chain-contracts
  static readonly worldMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.WORLD,
    OptimismPortal: '0xd5ec14a83B7d95BE1E2Ac12523e2dEE12Cbeea6C',
    OutputFinder: FINDER_MAINNET,
  };

  // https://docs.zircuit.com/smart-contracts/contract_addresses
  static readonly zircuitMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ZIRCUIT,
    OptimismPortal: '0x17bfAfA932d2e23Bd9B909Fd5B4D2e2a27043fb1',
    OutputFinder: FINDER_MAINNET,
  };
  // https://docs.zircuit.com/testnet/contract_addresses
  static readonly zircuitSepoliaConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.ZIRCUIT_SEPOLIA,
    OptimismPortal: '0x787f1C8c5924178689E0560a43D848bF8E54b23e',
    OutputFinder: FINDER_SEPOLIA,
  };

  // https://docs.lisk.com/about-lisk/contracts
  static readonly liskMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.LISK,
    OptimismPortal: '0x26dB93F8b8b4f7016240af62F7730979d353f9A7',
    OutputFinder: FINDER_MAINNET,
  };
  static readonly liskSepoliaConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.LISK_SEPOLIA,
    OptimismPortal: '0xe3d90F21490686Ec7eF37BE788E02dfC12787264',
    OutputFinder: FINDER_SEPOLIA,
  };

  // https://docs.mintchain.io/deploy/contracts#l1-contract-addresses
  static readonly mintMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.MINT,
    OptimismPortal: '0x59625d1FE0Eeb8114a4d13c863978F39b3471781',
    OutputFinder: FINDER_MAINNET,
    //commitFreqSec: 12 * 60 * 60 // 12hr
  };
  static readonly mintSepoliaConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.MINT_SEPOLIA,
    OptimismPortal: '0x0f598aFc1c303BF2d0Ee82435b58c7b47BC56Ed1',
    OutputFinder: FINDER_SEPOLIA,
  };

  // https://docs.gobob.xyz/learn/reference/contracts/#ethereum-l1
  static readonly bobMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.BOB,
    OptimismPortal: '0x994e3B01D130944a3E67BFd3B8Fc73069b959FEc',
    OutputFinder: FINDER_MAINNET,
    // commitFreqSec: 12hr
  };
  static readonly bobSepoliaConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.BOB_SEPOLIA,
    OptimismPortal: '0x7FA8cA1ED6F50D829cD960aE398949B5Bc339615',
    OutputFinder: FINDER_SEPOLIA,
  };

  readonly OptimismPortal: HexAddress;
  readonly OutputFinder: Contract;
  constructor(
    providers: ProviderPair,
    config: OPConfig,
    public minAgeSec = 0
  ) {
    super(providers);
    this.OptimismPortal = config.OptimismPortal;
    this.OutputFinder = new Contract(
      config.OutputFinder,
      FINDER_ABI,
      this.provider1
    );
  }

  override get unfinalized() {
    return !!this.minAgeSec; // nonzero => unfinalized
  }

  async fetchOutput(index: bigint): Promise<ABIOutputTuple | undefined> {
    try {
      return await this.OutputFinder.getOutput(this.OptimismPortal, index);
    } catch (err) {
      if (isCallException(err) && err.revert?.name === 'OutputNotFound') return;
      throw err;
    }
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return this.OutputFinder.findOutputIndex(
      this.OptimismPortal,
      this.minAgeSec,
      { blockTag: this.latestBlockTag }
    );
  }

  protected override async _fetchCommit(index: bigint) {
    const output = await this.fetchOutput(index);
    if (!output) throw new Error('invalid output');
    const commit = await this.createCommit(index, output.l2BlockNumber);
    return { ...commit, output };
  }
  override async isCommitStillValid(commit: OPCommit): Promise<boolean> {
    // see: L2OutputOracle.deleteL2Outputs()
    const output = await this.fetchOutput(commit.index);
    if (!output) return false; // undefined => deleted
    return output.outputRoot === commit.output.outputRoot; // unequal => replaced
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/L1/L2OutputOracle.sol#L231
    return sec;
  }
}
