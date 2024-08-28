import { readContract } from 'viem/actions';
import { base, mainnet } from 'viem/chains';

import type { RollupDeployment } from '../rollup.js';
import type { ClientPair, HexAddress } from '../types.js';
import { oracleAbi } from './abi.js';
import { AbstractOPRollup, type OPCommit } from './AbstractOPRollup.js';

export type OPConfig = {
  l2OutputOracleAddress: HexAddress;
};

export class OPRollup extends AbstractOPRollup {
  static readonly baseMainnetConfig: RollupDeployment<OPConfig> = {
    chain1: mainnet.id,
    chain2: base.id,
    l2OutputOracleAddress: '0x56315b90c40730925ec5485cf004d835058518A0',
  } as const;

  readonly l2OutputOracle: { address: HexAddress; abi: typeof oracleAbi };
  constructor(clients: ClientPair, config: OPConfig) {
    super(clients);
    this.l2OutputOracle = {
      address: config.l2OutputOracleAddress,
      abi: oracleAbi,
    };
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return readContract(this.client1, {
      ...this.l2OutputOracle,
      functionName: 'latestOutputIndex',
      blockTag: 'finalized',
    });
  }
  override async fetchParentCommitIndex(commit: OPCommit): Promise<bigint> {
    return commit.index - 1n;
  }
  override async fetchCommit(index: bigint): Promise<OPCommit> {
    const output = await readContract(this.client1, {
      ...this.l2OutputOracle,
      functionName: 'getL2Output',
      args: [index],
    });
    return this.createCommit(index, output.l2BlockNumber);
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/L1/L2OutputOracle.sol#L231
    return sec;
  }
}
