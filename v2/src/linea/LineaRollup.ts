import { encodeAbiParameters, parseAbiParameters, toHex, zeroHash } from 'viem';
import { getContractEvents, readContract } from 'viem/actions';
import { linea, lineaSepolia, mainnet, sepolia } from 'viem/chains';

import { CachedMap } from '../cached.js';
import {
  AbstractRollup,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type {
  ClientPair,
  EncodedProof,
  HexAddress,
  HexString,
  HexString32,
} from '../types.js';
import { rollupAbi } from './abi.js';
import { LineaProver } from './LineaProver.js';
import { type LineaClient } from './types.js';

// https://docs.linea.build/developers/quickstart/ethereum-differences
// https://github.com/Consensys/linea-contracts
// https://consensys.io/diligence/audits/2024/06/linea-ens/
// https://github.com/Consensys/linea-monorepo/blob/main/contracts/test/SparseMerkleProof.ts
// https://github.com/Consensys/linea-ens/blob/main/packages/linea-state-verifier/contracts/LineaSparseProofVerifier.sol

export type LineaCommit = RollupCommit<LineaProver> & {
  readonly stateRoot: HexString32;
};

export type LineaConfig = {
  l1MessageServiceAddress: HexAddress;
  sparseMerkleProofAddress: HexAddress;
};

export class LineaRollup extends AbstractRollup<LineaCommit, LineaClient> {
  // https://docs.linea.build/developers/quickstart/info-contracts
  static readonly mainnetConfig: RollupDeployment<LineaConfig> = {
    chain1: mainnet.id,
    chain2: linea.id,
    l1MessageServiceAddress: '0xd19d4B5d358258f05D7B411E21A1460D11B0876F',
    // https://github.com/Consensys/linea-ens/blob/main/packages/linea-ens-resolver/deployments/mainnet/SparseMerkleProof.json
    sparseMerkleProofAddress: '0xBf8C454Af2f08fDD90bB7B029b0C2c07c2a7b4A3',
  } as const;
  static readonly testnetConfig: RollupDeployment<LineaConfig> = {
    chain1: sepolia.id,
    chain2: lineaSepolia.id,
    l1MessageServiceAddress: '0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5',
    // https://github.com/Consensys/linea-ens/blob/main/packages/linea-ens-resolver/deployments/sepolia/SparseMerkleProof.json
    sparseMerkleProofAddress: '0x718D20736A637CDB15b6B586D8f1BF081080837f',
  } as const;

  readonly l1MessageService: { address: HexAddress; abi: typeof rollupAbi };
  constructor(clients: ClientPair<LineaClient>, config: LineaConfig) {
    super(clients);
    this.l1MessageService = {
      address: config.l1MessageServiceAddress,
      abi: rollupAbi,
    };
  }

  async fetchLatestCommitIndex(): Promise<bigint> {
    return readContract(this.client1, {
      ...this.l1MessageService,
      functionName: 'currentL2BlockNumber',
      blockTag: 'finalized',
    });
  }
  async fetchParentCommitIndex(commit: LineaCommit): Promise<bigint> {
    // find the starting state root
    const [log] = await getContractEvents(this.client1, {
      ...this.l1MessageService,
      eventName: 'DataFinalized',
      args: {
        lastBlockFinalized: commit.index,
        finalRootHash: commit.stateRoot,
      },
    });
    if (log) {
      // find the block that finalized this root
      const prevStateRoot = log.topics[2];
      const [prevLog] = await getContractEvents(this.client1, {
        ...this.l1MessageService,
        eventName: 'DataFinalized',
        args: { finalRootHash: prevStateRoot },
      });
      if (prevLog) return BigInt(prevLog.topics[1]); // l2BlockNumber
    }
    return -1n;
  }
  async fetchCommit(index: bigint): Promise<LineaCommit> {
    const stateRoot = await readContract(this.client1, {
      ...this.l1MessageService,
      functionName: 'stateRootHashes',
      args: [index],
    });
    if (stateRoot === zeroHash) {
      throw new Error('not finalized');
    }
    return {
      index,
      stateRoot,
      prover: new LineaProver(
        this.client2,
        toHex(index),
        new CachedMap(Infinity, this.commitCacheSize)
      ),
    };
  }
  encodeWitness(
    commit: LineaCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return encodeAbiParameters(parseAbiParameters('uint256, bytes[], bytes'), [
      commit.index,
      proofs,
      toHex(order),
    ]);
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // https://docs.linea.build/developers/guides/bridge/how-to-bridge-eth#bridge-eth-from-linea-mainnet-l2-to-ethereum-mainnet-l1
    // "Reminder: It takes at least 8 hours for the transaction to go through from L2 to L1."
    // 20240815: heuristic based on mainnet data
    // https://etherscan.io/advanced-filter?tadd=0x1335f1a2b3ff25f07f5fef07dd35d8fb4312c3c73b138e2fad9347b3319ab53c&ps=25&eladd=0xd19d4B5d358258f05D7B411E21A1460D11B0876F&eltpc=0x1335f1a2b3ff25f07f5fef07dd35d8fb4312c3c73b138e2fad9347b3319ab53c
    const blocksPerCommit = 5000; // every 2000-8000+ L2 blocks
    const secPerCommit = 2 * 3600; // every ~2 hours
    return blocksPerCommit * Math.ceil(sec / secPerCommit); // units of commit
  }
}
