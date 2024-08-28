import { readContract } from 'viem/actions';
import { baseSepolia, mainnet, optimism, sepolia } from 'viem/chains';

import type { RollupDeployment } from '../rollup.js';
import type { ClientPair, HexAddress } from '../types.js';
import { gameFinderAbi, portalAbi } from './abi.js';
import { AbstractOPRollup, type OPCommit } from './AbstractOPRollup.js';

// https://docs.optimism.io/chain/differences
// https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html

export type OPFaultConfig = {
  optimismPortalAddress: HexAddress;
  gameFinderAddress: HexAddress;
  gameTypes?: number[]; // if empty, dynamically uses respectedGameType()
};

const callOptions = { blockTag: 'finalized' } as const;

export class OPFaultRollup extends AbstractOPRollup {
  static readonly mainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: mainnet.id,
    chain2: optimism.id,
    // https://docs.optimism.io/chain/addresses
    optimismPortalAddress: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
    gameFinderAddress: '0x5A8E83f0E728bEb821b91bB82cFAE7F67bD36f7e',
  } as const;
  static readonly baseTestnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: sepolia.id,
    chain2: baseSepolia.id,
    // https://docs.base.org/docs/base-contracts/#ethereum-testnet-sepolia
    optimismPortalAddress: '0x49f53e41452C74589E85cA1677426Ba426459e85',
    gameFinderAddress: '0x0f1449C980253b576aba379B11D453Ac20832a89',
  } as const;

  static async create(clients: ClientPair, config: OPFaultConfig) {
    const optimismPortal = {
      address: config.optimismPortalAddress,
      abi: portalAbi,
    };
    const gameFinder = {
      address: config.gameFinderAddress,
      abi: gameFinderAbi,
    };
    const bitMask = (config.gameTypes ?? []).reduce((a, x) => a | (1 << x), 0);
    return new this(clients, optimismPortal, gameFinder, BigInt(bitMask));
  }
  private constructor(
    clients: ClientPair,
    readonly optimismPortal: { address: HexAddress; abi: typeof portalAbi },
    readonly gameFinder: { address: HexAddress; abi: typeof gameFinderAbi },
    readonly gameTypeBitMask: bigint
  ) {
    super(clients);
  }

  async fetchRespectedGameType(): Promise<number> {
    return readContract(this.client1, {
      ...this.optimismPortal,
      ...callOptions,
      functionName: 'respectedGameType',
    });
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    // the primary assumption is that the anchor root is the finalized state
    // however, this is strangely conditional on the gameType
    // (apparently because the anchor state registry is *not* intended for finalization)
    // after a gameType switch, the finalized state "rewinds" to the latest game of the new type
    // to solve this, we use the latest finalized game of *any* supported gameType
    // 20240820: correctly handles the aug 16 respectedGameType change
    // TODO: this should be simplified in the future once there is a better policy
    // 20240822: once again uses a helper contract to reduce rpc burden
    return readContract(this.client1, {
      ...this.gameFinder,
      ...callOptions,
      functionName: 'findFinalizedGameIndex',
      args: [this.optimismPortal.address, this.gameTypeBitMask, 0n],
    });
  }
  override async fetchParentCommitIndex(commit: OPCommit) {
    return readContract(this.client1, {
      ...this.gameFinder,
      ...callOptions,
      functionName: 'findFinalizedGameIndex',
      args: [this.optimismPortal.address, this.gameTypeBitMask, commit.index],
    });
  }
  override async fetchCommit(index: bigint) {
    const [, , l2BlockNumber] = await readContract(this.client1, {
      ...this.gameFinder,
      ...callOptions,
      functionName: 'getFinalizedGame',
      args: [this.optimismPortal.address, this.gameTypeBitMask, index],
    });
    if (!l2BlockNumber) {
      throw new Error(`Game(${index}) not finalized`);
    }
    return this.createCommit(index, l2BlockNumber);
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/dispute/FaultDisputeGame.sol#L590
    return sec;
  }
}
