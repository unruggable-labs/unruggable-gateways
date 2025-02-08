import type { RollupDeployment } from '../rollup.js';
import type { HexAddress, HexString32, ProviderPair } from '../types.js';
import { AbstractOPRollup, type AbstractOPCommit } from './AbstractOPRollup.js';
import { CHAINS } from '../chains.js';
import { isRevert } from '../utils.js';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';

export const OUTPUT_FINDER_ABI = new Interface([
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

export type OPCommit = AbstractOPCommit & { output: ABIOutputTuple };

type ABIOutputTuple = {
  outputRoot: HexString32;
  timestamp: bigint;
  l2BlockNumber: bigint;
};

const OUTPUT_FINDER_MAINNET = '0xFe75ecc04DB4f46762126924d21Ae3d35087c482';
const OUTPUT_FINDER_HOLESKY = '0x35FF17ae0a5ac38F66E7994401a3c304023881Ad';
const OUTPUT_FINDER_OP_BNB = '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05';

export class OPRollup extends AbstractOPRollup<OPCommit> {
  // 20241030: changed to fault proofs
  // https://x.com/base/status/1851672364439814529
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
    OutputFinder: OUTPUT_FINDER_MAINNET,
  };

  // https://docs.frax.com/fraxtal/addresses/fraxtal-contracts#mainnet
  static readonly fraxtalMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.FRAXTAL,
    OptimismPortal: '0x36cb65c1967A0Fb0EEE11569C51C2f2aA1Ca6f6D',
    OutputFinder: OUTPUT_FINDER_MAINNET,
  };

  // https://docs.zora.co/zora-network/network#zora-network-mainnet-1
  static readonly zoraMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ZORA,
    OptimismPortal: '0x1a0ad011913A150f69f6A19DF447A0CfD9551054',
    OutputFinder: OUTPUT_FINDER_MAINNET,
  };

  // https://docs.mantle.xyz/network/system-information/on-chain-system/key-l1-contract-address
  static readonly mantleMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.MANTLE,
    OptimismPortal: '0x31d543e7BE1dA6eFDc2206Ef7822879045B9f481',
    OutputFinder: OUTPUT_FINDER_MAINNET,
  };

  // https://docs.mode.network/general-info/mainnet-contract-addresses/l1-l2-contracts
  static readonly modeMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.MODE,
    OptimismPortal: '0xc54cb22944F2bE476E02dECfCD7e3E7d3e15A8Fb',
    OutputFinder: OUTPUT_FINDER_MAINNET,
  };

  // https://docs.cyber.co/build-on-cyber/addresses-mainnet
  // https://docs.cyber.co/build-on-cyber/addresses-testnet
  static readonly cyberMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.CYBER,
    OptimismPortal: '0x1d59bc9fcE6B8E2B1bf86D4777289FFd83D24C99',
    OutputFinder: OUTPUT_FINDER_MAINNET,
  };

  // https://redstone.xyz/docs/contract-addresses
  static readonly redstoneMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.REDSTONE,
    OptimismPortal: '0xa426A052f657AEEefc298b3B5c35a470e4739d69',
    OutputFinder: OUTPUT_FINDER_MAINNET,
  };

  // https://docs.shape.network/documentation/technical-details/contract-addresses#mainnet
  static readonly shapeMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.SHAPE,
    OptimismPortal: '0xEB06fFa16011B5628BaB98E29776361c83741dd3',
    OutputFinder: OUTPUT_FINDER_MAINNET,
  };

  // https://docs.bnbchain.org/bnb-opbnb/core-concepts/opbnb-protocol-addresses/
  static readonly opBNBMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.BSC,
    chain2: CHAINS.OP_BNB,
    OptimismPortal: '0x4386C8ABf2009aC0c263462Da568DD9d46e52a31',
    OutputFinder: OUTPUT_FINDER_OP_BNB,
  };

  // https://storage.googleapis.com/cel2-rollup-files/alfajores/deployment-l1.json
  static readonly celoAlfajoresConfig: RollupDeployment<OPConfig> = {
    chain1: CHAINS.HOLESKY,
    chain2: CHAINS.CELO_ALFAJORES,
    OptimismPortal: '0x82527353927d8D069b3B452904c942dA149BA381',
    OutputFinder: OUTPUT_FINDER_HOLESKY,
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
      OUTPUT_FINDER_ABI,
      providers.provider1
    );
  }

  override get unfinalized() {
    return !!this.minAgeSec; // nonzero => unfinalized
  }

  async fetchOutput(index: bigint): Promise<ABIOutputTuple | undefined> {
    try {
      return await this.OutputFinder.getOutput(this.OptimismPortal, index);
    } catch (err) {
      if (isRevert(err) && err.revert?.name === 'OutputNotFound') return;
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
