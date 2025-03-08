import type {
  ChainPair,
  HexString,
  Provider,
  ProviderPair,
  ProofSequenceV1,
  ProofSequence,
  BigNumberish,
} from './types.js';
import type { AbstractProver } from './vm.js';

export type RollupDeployment<Config> = Readonly<ChainPair & Config>;

export type RollupCommit<P extends AbstractProver> = {
  readonly index: bigint;
  readonly prover: P;
};

export type Rollup = AbstractRollup<RollupCommit<AbstractProver>>;

export type RollupCommitType<R extends Rollup> = Parameters<
  R['fetchParentCommitIndex']
>[0];

export abstract class AbstractRollup<C extends RollupCommit<AbstractProver>> {
  // allows configuration of commit and prover
  // "expand LRU cache" => prover.proofLRU.maxCached = 1_000_000
  // "disable fast lookups" => prover.fast = false
  // "keep fast cache around longer" => prover.cache.cacheMs = Infinity
  // "limit targets" => prover.maxUniqueTargets = 1
  configure: (<T extends C>(commit: T) => void) | undefined;
  // block tag used for "latest" information
  latestBlockTag: BigNumberish = 'finalized';
  // block interval for event scanning
  getLogsStepSize = 10000;
  readonly provider1: Provider;
  readonly provider2: Provider;
  constructor(providers: ProviderPair) {
    this.provider1 = providers.provider1;
    this.provider2 = providers.provider2;
  }

  // abstract interface
  protected abstract _fetchCommit(index: bigint): Promise<C>;
  abstract fetchLatestCommitIndex(): Promise<bigint>;
  abstract encodeWitness(commit: C, proofSeq: ProofSequence): HexString;
  abstract windowFromSec(sec: number): number;

  // default interface
  get unfinalized() {
    return false; // all rollups are finalized
  }
  protected async _fetchParentCommitIndex(commit: C): Promise<bigint> {
    return commit.index - 1n; // immediate previous
  }
  async isCommitStillValid(_commit: C) {
    return true; // always valid
  }

  // abstract wrappers
  async fetchParentCommitIndex(commit: C) {
    try {
      if (!commit.index) throw undefined;
      const index = await this._fetchParentCommitIndex(commit);
      if (index >= commit.index) throw new Error(`${index} >= ${commit.index}`);
      if (index < 0) throw undefined;
      return index;
    } catch (cause) {
      throw new Error(`no parent commit: ${commit.index}`, { cause });
    }
  }
  async fetchCommit(index: bigint) {
    try {
      const commit = await this._fetchCommit(index);
      if (commit.index != index) throw new Error(`${index} != ${commit.index}`);
      this.configure?.(commit);
      return commit;
    } catch (cause) {
      throw new Error(`invalid commit: ${index}`, { cause });
    }
  }

  // convenience
  async fetchLatestCommit() {
    return this.fetchCommit(await this.fetchLatestCommitIndex());
  }
  async fetchParentCommit(commit: C) {
    return this.fetchCommit(await this.fetchParentCommitIndex(commit));
  }
  async fetchRecentCommits(count: number): Promise<C[]> {
    if (count < 1) return [];
    let commit = await this.fetchLatestCommit();
    const v = [commit];
    while (v.length < count && commit.index > 0) {
      commit = await this.fetchParentCommit(commit);
      v.push(commit);
    }
    return v;
  }
  get defaultWindow() {
    // was 1 day (86400)
    // 20241116: changed 6 hours
    return this.windowFromSec(6 * 3600);
  }
}

export interface RollupWitnessV1<C extends RollupCommit<AbstractProver>> {
  encodeWitnessV1(commit: C, proofSeq: ProofSequenceV1): HexString;
}

export function supportsV1<R extends Rollup>(
  rollup: R
): rollup is R & RollupWitnessV1<RollupCommitType<R>> {
  return 'encodeWitnessV1' in rollup;
}
