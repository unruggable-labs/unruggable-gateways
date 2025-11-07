import type { RollupDeployment } from '../rollup.js';
import type { HexAddress, HexString32, ProviderPair } from '../types.js';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { CHAINS } from '../chains.js';
import { isEthersError } from '../utils.js';
import {
  AbstractOPRollup,
  hashOutputRootProof,
  type AbstractOPCommit,
} from './AbstractOPRollup.js';

// https://docs.optimism.io/chain/differences
// https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html

const PORTAL_ABI = new Interface([
  `function disputeGameFactory() view returns (address)`,
  `function respectedGameType() view returns (uint32)`,
  `function disputeGameBlacklist(address game) view returns (bool)`,
]);

const GAME_ABI = new Interface([`function rootClaim() view returns (bytes32)`]);

const FINDER_ABI = new Interface([
  `error GameNotFound()`,
  `function findGameIndex((address portal, uint256 minAge, uint256[] allowedGameTypes, address[] allowedProposers), uint256 gameCount) view returns (uint256)`,
  `function gameAtIndex((address portal, uint256 minAge, uint256[] allowedGameTypes, address[] allowedProposers), uint256 gameIndex) view returns (
	 uint256 gameType, uint256 created, address gameProxy, uint256 l2BlockNumber, bytes32 rootClaim
   )`,
]);

export type OPFaultConfig = {
  OptimismPortal: HexAddress;
  GameFinder: HexAddress;
};

export type OPFaultCommit = AbstractOPCommit & { game: ABIFoundGame };

type ABIFoundGame = {
  gameType: bigint;
  created: bigint;
  gameProxy: HexAddress;
  l2BlockNumber: bigint;
  rootClaim: string;
};

const FINDER_MAINNET = '0xdc535021b10995e423607706Bc313F28a95CdB94'; // 20251107 (not updated yet)
const FINDER_SEPOLIA = '0x98261818bEe2E69866A936564d1aDF760c3e953c'; // 20251107

export class OPFaultRollup extends AbstractOPRollup<OPFaultCommit> {
  static readonly PORTAL_ABI = PORTAL_ABI;
  static readonly GAME_ABI = GAME_ABI;
  static readonly FINDER_ABI = FINDER_ABI;

  static readonly FINDERS = new Map([
    [CHAINS.MAINNET, FINDER_MAINNET],
    [CHAINS.SEPOLIA, FINDER_SEPOLIA],
    //[CHAINS.HOLESKY, FINDER_HOLESKY],
    //[CHAINS.HOODI, FINDER_HOODI],
  ]);

  // https://docs.optimism.io/chain/addresses
  static readonly mainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.OP,
    OptimismPortal: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
    GameFinder: FINDER_MAINNET,
  };
  static readonly sepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.OP_SEPOLIA,
    OptimismPortal: '0x16Fc5058F25648194471939df75CF27A2fdC48BC',
    GameFinder: FINDER_SEPOLIA,
  };

  // https://docs.base.org/docs/base-contracts#l1-contract-addresses
  static readonly baseMainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.BASE,
    OptimismPortal: '0x49048044D57e1C92A77f79988d21Fa8fAF74E97e',
    GameFinder: FINDER_MAINNET,
  };
  // https://docs.base.org/docs/base-contracts/#ethereum-testnet-sepolia
  static readonly baseSepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.BASE_SEPOLIA,
    OptimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
    GameFinder: FINDER_SEPOLIA,
  };

  // https://docs.inkonchain.com/useful-information/contracts#l1-contract-addresses
  static readonly inkMainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.INK,
    OptimismPortal: '0x5d66c1782664115999c47c9fa5cd031f495d3e4f',
    GameFinder: FINDER_MAINNET,
  };
  static readonly inkSepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.INK_SEPOLIA,
    OptimismPortal: '0x5c1d29C6c9C8b0800692acC95D700bcb4966A1d7',
    GameFinder: FINDER_SEPOLIA,
  };

  // https://docs.unichain.org/docs/technical-information/contract-addresses
  static readonly unichainMainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.UNICHAIN,
    OptimismPortal: '0x0bd48f6B86a26D3a217d0Fa6FfE2B491B956A7a2',
    GameFinder: FINDER_MAINNET,
  };
  static readonly unichainSepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.UNICHAIN_SEPOLIA,
    OptimismPortal: '0x0d83dab629f0e0F9d36c0Cbc89B69a489f0751bD',
    GameFinder: FINDER_SEPOLIA,
  };

  // https://docs.soneium.org/docs/builders/contracts
  static readonly soneiumMainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.SONEIUM,
    OptimismPortal: '0x88e529a6ccd302c948689cd5156c83d4614fae92',
    GameFinder: FINDER_MAINNET,
  };
  static readonly soneiumMinatoConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.SONEIUM_SEPOLIA,
    OptimismPortal: '0x65ea1489741A5D72fFdD8e6485B216bBdcC15Af3',
    GameFinder: FINDER_SEPOLIA,
  };

  // https://build.swellnetwork.io/docs/developer-resources/contract-addresses
  static readonly swellMainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.SWELL,
    OptimismPortal: '0x758E0EE66102816F5C3Ec9ECc1188860fbb87812',
    GameFinder: FINDER_MAINNET,
  };
  static readonly swellSepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.SWELL_SEPOLIA,
    OptimismPortal: '0x595329c60c0b9e54a5246e98fb0fa7fcfd454f64',
    GameFinder: FINDER_SEPOLIA,
  };

  // https://docs.worldcoin.org/world-chain/developers/world-chain-contracts
  static readonly worldMainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.WORLD,
    OptimismPortal: '0xd5ec14a83B7d95BE1E2Ac12523e2dEE12Cbeea6C',
    GameFinder: FINDER_MAINNET,
  };

  // https://storage.googleapis.com/cel2-rollup-files/celo/deployment-l1.json
  static readonly celoMainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.CELO,
    OptimismPortal: '0xc5c5D157928BDBD2ACf6d0777626b6C75a9EAEDC',
    GameFinder: FINDER_MAINNET,
  };
  // https://storage.googleapis.com/cel2-rollup-files/celo-sepolia/deployment-l1.json
  static readonly celoSepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.CELO_SEPOLIA,
    OptimismPortal: '0x44ae3d41a335a7d05eb533029917aad35662dcc2',
    GameFinder: FINDER_SEPOLIA,
  };

  // https://nft.docs.zora.co/zora-network/intro
  static readonly zoraMainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.ZORA,
    OptimismPortal: '0x1a0ad011913A150f69f6A19DF447A0CfD9551054',
    GameFinder: FINDER_MAINNET,
  };

  // 20240917: delayed constructor not needed
  readonly OptimismPortal: Contract;
  readonly GameFinder: Contract;
  public gameTypes: bigint[] = [];
  public allowedProposers: HexAddress[] = [];
  unfinalizedRootClaimTimeoutMs = 15000;
  constructor(
    providers: ProviderPair,
    config: OPFaultConfig,
    public minAgeSec = 0
  ) {
    super(providers);
    this.OptimismPortal = new Contract(
      config.OptimismPortal,
      PORTAL_ABI,
      this.provider1
    );
    this.GameFinder = new Contract(
      config.GameFinder,
      FINDER_ABI,
      this.provider1
    );
  }

  override get unfinalized() {
    return !!this.minAgeSec; // nonzero => unfinalized
  }

  get paramTuple() {
    return [
      this.OptimismPortal.target,
      this.minAgeSec,
      this.gameTypes,
      this.allowedProposers,
    ];
  }

  async getGameTypes(): Promise<bigint[]> {
    return this.gameTypes.length
      ? this.gameTypes
      : [await this.fetchRespectedGameType()];
  }

  async fetchRespectedGameType(): Promise<bigint> {
    return this.OptimismPortal.respectedGameType({
      blockTag: this.latestBlockTag,
    });
  }
  private async _ensureRootClaim(index: bigint) {
    // dodge canary by requiring a valid root claim
    // finalized claims are assumed valid
    if (this.unfinalized) {
      const timeout = Date.now() + this.unfinalizedRootClaimTimeoutMs; // prevent "infinite" loop
      for (;;) {
        try {
          await this.fetchCommit(index);
          break;
        } catch (err) {
          // NOTE: this could fail for a variety of reasons
          // so we can't just catch "invalid root claim"
          // canary often has invalid block <== likely triggers first
          // canary has invalid time
          // canary has invalid root claim
          // 20250503: this can infinite loop when the rpc errors suck
          if (isEthersError(err)) throw err;
          if (Date.now() > timeout) {
            throw new Error(`timeout _ensureRootClaim()`);
          }
          index = await this.GameFinder.findGameIndex(this.paramTuple, index);
        }
      }
    }
    return index;
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    // the primary assumption is that the anchor root is the finalized state
    // however, this is strangely conditional on the gameType
    // (apparently because the anchor state registry is *not* intended for finalization)
    // after a gameType switch, the finalized state "rewinds" to the latest game of the new type
    // to solve this, we use the latest finalized game of *any* supported gameType
    // 20240820: correctly handles the aug 16 respectedGameType change
    // this should be simplified in the future once there is a better policy
    // 20240822: once again uses a helper contract to reduce rpc burden
    return this._ensureRootClaim(
      await this.GameFinder.findGameIndex(
        this.paramTuple,
        0, // most recent game
        { blockTag: this.latestBlockTag }
      )
    );
  }
  protected override async _fetchParentCommitIndex(
    commit: OPFaultCommit
  ): Promise<bigint> {
    return this._ensureRootClaim(
      await this.GameFinder.findGameIndex(this.paramTuple, commit.index)
    );
  }
  protected override async _fetchCommit(index: bigint) {
    // note: GameFinder checks isCommitStillValid()
    const game: ABIFoundGame = (
      await this.GameFinder.gameAtIndex(this.paramTuple, index)
    ).toObject();
    if (!game.l2BlockNumber) throw new Error('invalid game');
    const commit = await this.createCommit(index, game.l2BlockNumber);
    if (this.unfinalized) {
      const gameProxy = new Contract(game.gameProxy, GAME_ABI, this.provider1);
      const expected: HexString32 = await gameProxy.rootClaim();
      const computed = hashOutputRootProof(commit);
      if (expected !== computed) throw new Error(`invalid root claim`);
    }
    return { ...commit, game };
  }
  override async isCommitStillValid(commit: OPFaultCommit): Promise<boolean> {
    return !(await this.OptimismPortal.disputeGameBlacklist(
      commit.game.gameProxy
    ));
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/dispute/FaultDisputeGame.sol#L590
    return sec;
  }
}
