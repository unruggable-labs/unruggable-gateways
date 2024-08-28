import type { Client } from 'viem';

import type {
  ChainPair,
  ClientPair,
  EncodedProof,
  HexString,
} from './types.js';
import type { AbstractProver } from './vm.js';

export type RollupDeployment<Config> = ChainPair & Config;

export type RollupCommit<P extends AbstractProver> = {
  readonly index: bigint;
  readonly prover: P;
};

export type Rollup = AbstractRollup<RollupCommit<AbstractProver>>;

export abstract class AbstractRollup<
  commit extends RollupCommit<AbstractProver>,
  client2 extends Client = Client,
  client1 extends Client = Client,
> {
  commitCacheSize = 10000;
  readonly client1: client1;
  readonly client2: client2;
  constructor({ client1, client2 }: ClientPair<client2, client1>) {
    this.client1 = client1;
    this.client2 = client2;
  }
  abstract fetchLatestCommitIndex(): Promise<bigint>;
  abstract fetchParentCommitIndex(commit: commit): Promise<bigint>;
  abstract fetchCommit(index: bigint): Promise<commit>;
  abstract encodeWitness(
    commit: commit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString;
  async fetchLatestCommit() {
    return this.fetchCommit(await this.fetchLatestCommitIndex());
  }
  async fetchRecentCommits(count: number): Promise<commit[]> {
    if (count < 1) return [];
    let commit = await this.fetchLatestCommit();
    const v = [commit];
    while (v.length < count && commit.index > 0) {
      commit = await this.fetchCommit(
        await this.fetchParentCommitIndex(commit)
      );
      v.push(commit);
    }
    return v;
  }
  abstract windowFromSec(sec: number): number;
  get defaultWindow() {
    return this.windowFromSec(86400);
  }
}

export abstract class AbstractRollupV1<
  C extends RollupCommit<AbstractProver>,
> extends AbstractRollup<C> {
  abstract encodeWitnessV1(
    commit: C,
    accountProof: EncodedProof,
    storageProofs: EncodedProof[]
  ): HexString;
}
