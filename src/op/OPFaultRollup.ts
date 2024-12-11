import type { RollupDeployment } from '../rollup.js';
import type { HexAddress, HexString32, ProviderPair } from '../types.js';
import { Contract } from 'ethers/contract';
import { PORTAL_ABI, GAME_FINDER_ABI, GAME_ABI } from './types.js';
import { CHAINS } from '../chains.js';
import { isEthersError } from '../utils.js';
import {
  AbstractOPRollup,
  hashOutputRootProof,
  type OPCommit,
} from './AbstractOPRollup.js';

// https://docs.optimism.io/chain/differences
// https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html

export type OPFaultConfig = {
  OptimismPortal: HexAddress;
  GameFinder: HexAddress;
  gameTypes?: number[]; // if empty, dynamically uses respectedGameType()
  minAgeSec?: number; // if falsy, requires finalization
};

type ABIFoundGame = {
  gameType: bigint;
  created: bigint;
  gameProxy: HexAddress;
  l2BlockNumber: bigint;
};

const GAME_FINDER_MAINNET = '0x475a86934805ef2c52ef61a8fed644d4c9ac91d8';
const GAME_FINDER_SEPOLIA = '0x4Bf352061FEB81a486A2fd325839d715bDc4038c';

function maskFromGameTypes(gameTypes: number[] = []) {
  return gameTypes.reduce((a, x) => a | (1 << x), 0);
}

export class OPFaultRollup extends AbstractOPRollup {
  // https://docs.optimism.io/chain/addresses
  static readonly mainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.OP,
    OptimismPortal: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
    GameFinder: GAME_FINDER_MAINNET,
  };
  static readonly sepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.OP_SEPOLIA,
    OptimismPortal: '0x16Fc5058F25648194471939df75CF27A2fdC48BC',
    GameFinder: GAME_FINDER_SEPOLIA,
  };

  // https://docs.base.org/docs/base-contracts#l1-contract-addresses
  static readonly baseMainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.MAINNET,
    chain2: CHAINS.BASE,
    OptimismPortal: '0x49048044D57e1C92A77f79988d21Fa8fAF74E97e',
    GameFinder: GAME_FINDER_MAINNET,
  };
  // https://docs.base.org/docs/base-contracts/#ethereum-testnet-sepolia
  static readonly baseSepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.BASE_SEPOLIA,
    OptimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
    GameFinder: GAME_FINDER_SEPOLIA,
  };

  // https://docs.inkonchain.com/build/useful-info/ink-contracts#l1-testnet-contracts-sepolia
  static readonly inkSepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.INK_SEPOLIA,
    OptimismPortal: '0x5c1d29C6c9C8b0800692acC95D700bcb4966A1d7',
    GameFinder: GAME_FINDER_SEPOLIA,
  };

  // https://docs.unichain.org/docs/technical-information/contract-addresses#l1-contracts
  static readonly unichainSepoliaConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.UNICHAIN_SEPOLIA,
    OptimismPortal: '0x0d83dab629f0e0F9d36c0Cbc89B69a489f0751bD',
    GameFinder: GAME_FINDER_SEPOLIA,
  };

  // https://docs.soneium.org/docs/builders/contracts#optimism-l1-stack-on-sepolia
  static readonly soneiumMinatoConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAINS.SEPOLIA,
    chain2: CHAINS.SONEIUM_MINATO,
    OptimismPortal: '0x65ea1489741A5D72fFdD8e6485B216bBdcC15Af3',
    GameFinder: GAME_FINDER_SEPOLIA,
  };

  // 20240917: delayed constructor not needed
  readonly OptimismPortal: Contract;
  readonly GameFinder: Contract;
  readonly gameTypeBitMask: number;
  readonly minAgeSec: number;
  constructor(providers: ProviderPair, config: OPFaultConfig) {
    super(providers);
    this.OptimismPortal = new Contract(
      config.OptimismPortal,
      PORTAL_ABI,
      providers.provider1
    );
    this.GameFinder = new Contract(
      config.GameFinder,
      GAME_FINDER_ABI,
      providers.provider1
    );
    this.minAgeSec = config.minAgeSec ?? 0;
    this.gameTypeBitMask = maskFromGameTypes(config.gameTypes);
  }

  override get unfinalized() {
    return !!this.minAgeSec;
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
          if (isEthersError(err)) throw err;
          index = await this.GameFinder.findGameIndex(
            this.OptimismPortal.target,
            this.minAgeSec,
            this.gameTypeBitMask,
            index
          );
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
        this.OptimismPortal.target,
        this.minAgeSec,
        this.gameTypeBitMask,
        0, // most recent game
        { blockTag: this.latestBlockTag }
      )
    );
  }
  protected override async _fetchParentCommitIndex(
    commit: OPCommit
  ): Promise<bigint> {
    return this._ensureRootClaim(
      await this.GameFinder.findGameIndex(
        this.OptimismPortal.target,
        this.minAgeSec,
        this.gameTypeBitMask,
        commit.index
      )
    );
  }
  protected override async _fetchCommit(index: bigint) {
    const game: ABIFoundGame = await this.GameFinder.gameAtIndex(
      this.OptimismPortal.target,
      this.minAgeSec,
      this.gameTypeBitMask,
      index
    );
    if (!game.l2BlockNumber) throw new Error('invalid game');
    const commit = await this.createCommit(index, game.l2BlockNumber);
    if (this.unfinalized) {
      const gameProxy = new Contract(game.gameProxy, GAME_ABI, this.provider1);
      const expected: HexString32 = await gameProxy.rootClaim();
      const computed = hashOutputRootProof(commit);
      if (expected !== computed) throw new Error(`invalid root claim`);
    }
    return commit;
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/dispute/FaultDisputeGame.sol#L590
    return sec;
  }
}
