import { type RollupCommitType, type Rollup, supportsV1 } from './rollup.js';
import type { HexString } from './types.js';
import { Interface } from 'ethers/abi';
import { solidityPackedKeccak256, id as keccakStr } from 'ethers/hash';
import { getBytes } from 'ethers/utils';
import { CachedMap, CachedValue, LRU } from './cached.js';
import { ABI_CODER } from './utils.js';
import { GatewayRequestV1 } from './v1.js';
import { EZCCIP } from '@resolverworks/ezccip';

export const GATEWAY_ABI = new Interface([
  `function proveRequest(bytes context, tuple(bytes)) returns (bytes)`,
  `function getStorageSlots(address target, bytes32[] commands, bytes[] constants) returns (bytes)`,
]);

// shorten the request hash for less spam and easier comparision
function shortHash(x: string): string {
  return x.slice(-8);
}

// default number of answers to keep in memory
// (what is the distribution of real-load resolution counts?)
// edit with: gateway.callLRU.max
const callCapacity0 = 1000;
// ms to wait until checking for a new commit
// edit with: gateway.latestCache.cacheMs
const pollMs0 = 60000;

type CachedCommit<R extends Rollup> = {
  commit: RollupCommitType<R>;
  valid: CachedValue<boolean>;
  parent: CachedValue<bigint>;
};

export class Gateway<R extends Rollup> extends EZCCIP {
  // the max number of non-latest commitments to keep in memory
  commitDepth = 2;
  // if true, requests beyond the commit depth are supported
  allowHistorical = false;
  readonly latestCache = new CachedValue(
    () => this.rollup.fetchLatestCommitIndex(),
    pollMs0
  );
  readonly commitCacheMap = new CachedMap<bigint, CachedCommit<R>>(Infinity);
  readonly callLRU = new LRU<string, Uint8Array>(callCapacity0);
  constructor(readonly rollup: R) {
    super();
    this.register(GATEWAY_ABI, {
      proveRequest: async ([ctx, [req]], _context, history) => {
        // given the requested commitment, we answer: min(requested, latest)
        const commit = await this.getRecentCommit(BigInt(ctx.slice(0, 66)));
        // we cannot hash the context.calldata directly because the requested
        // commit might be different, so we hash using the determined commit
        const hash = solidityPackedKeccak256(
          ['uint256', 'bytes'],
          [commit.index, req]
        );
        history.show = [commit.index, shortHash(hash)];
        // NOTE: for a given commit + request, calls are pure
        return this.callLRU.cache(hash, async () => {
          const state = await commit.prover.evalDecoded(req);
          const proofSeq = await commit.prover.prove(state.needs);
          return getBytes(this.rollup.encodeWitness(commit, proofSeq));
        });
      },
    });
    // NOTE: this only works if V1 and V2 share same proof encoding!
    if (supportsV1(rollup)) {
      this.register(GATEWAY_ABI, {
        getStorageSlots: async (
          [target, commands, constants],
          context,
          history
        ) => {
          // V1 protocol is always latest
          const commit = await this.getLatestCommit();
          // we cannot hash the context.calldata directly because the request
          // doesn't contain the specific commit index
          const hash = keccakStr(`${commit.index}:${context.calldata}`);
          history.show = [commit.index, shortHash(hash)];
          return this.callLRU.cache(hash, async () => {
            const req = new GatewayRequestV1(target, commands, constants).v2(); // upgrade v1 to v2
            const state = await commit.prover.evalRequest(req);
            const proofSeq = await commit.prover.proveV1(state.needs);
            const witness = rollup.encodeWitnessV1(commit, proofSeq);
            return getBytes(ABI_CODER.encode(['bytes'], [witness]));
          });
        },
      });
    }
  }
  private async _updateLatest() {
    const prev = await this.latestCache.value?.catch(() => {});
    const next = await this.latestCache.get();
    const cached = await this.cachedCommit(next);
    const max = this.commitDepth + 1; // depth + latest
    if (prev !== next && this.commitCacheMap.cachedSize > max) {
      // purge the oldest if we have too many
      // note: this will nuke any historicals
      const old = [...this.commitCacheMap.cachedKeys()].sort().slice(0, -max);
      for (const key of old) {
        this.commitCacheMap.delete(key);
      }
    }
    return cached;
  }

  async getLatestCommit(): Promise<RollupCommitType<R>> {
    return (await this._updateLatest()).commit;
  }
  async getRecentCommit(index: bigint): Promise<RollupCommitType<R>> {
    const latest = await this._updateLatest();
    let cursor = latest;
    // check recent cache in linear order
    for (let depth = 0; ; ) {
      if (index >= cursor.commit.index) return cursor.commit;
      if (++depth >= this.commitDepth) break;
      const prev = await cursor.parent.get();
      cursor = await this.cachedCommit(prev);
    }
    // if older than that, consider one-off commit
    // this can be unaligned but must be finalized
    if (this.allowHistorical) {
      // 20240926: maybe this should be cached for a bit (was 0)
      return (await this.cachedCommit(index, 250)).commit;
    }
    throw new Error(
      `too old: ${index} vs ${latest.commit.index}[depth=${this.commitDepth}]`
    );
  }
  private async cachedCommit(
    index: bigint,
    cacheMs?: number
  ): Promise<CachedCommit<R>> {
    // see if we already have this commit
    const cached = await this.commitCacheMap.peek(index);
    // if we do, check if it's still valid
    if (cached && !(await cached.valid.get())) {
      // invalid, so nuke it, and request it again
      this.commitCacheMap.delete(index);
    }
    return this.commitCacheMap.get(
      index,
      async (i) => {
        const commit = await this.rollup.fetchCommit(i);
        const parent = new CachedValue(
          () => this.rollup.fetchParentCommitIndex(commit),
          this.latestCache.cacheMs
        );
        const valid = new CachedValue(
          () => this.rollup.isCommitStillValid(commit),
          this.latestCache.cacheMs
        );
        valid.set(true); // mark it as valid
        return { commit, valid, parent };
      },
      cacheMs
    );
  }
}

export abstract class GatewayV1<R extends Rollup> extends EZCCIP {
  private latestCommit: RollupCommitType<R> | undefined;
  readonly latestCache = new CachedValue(async () => {
    const index = await this.rollup.fetchLatestCommitIndex();
    // since we can only serve the latest commit
    // we only keep the latest commit
    if (
      index !== this.latestCommit?.index ||
      !(await this.rollup.isCommitStillValid(this.latestCommit))
    ) {
      this.latestCommit = await this.rollup.fetchCommit(index);
    }
    return this.latestCommit;
  }, pollMs0);
  readonly callLRU = new LRU<string, Uint8Array>(callCapacity0);
  constructor(readonly rollup: R) {
    super();
    this.register(GATEWAY_ABI, {
      getStorageSlots: async (
        [target, commands, constants],
        context,
        history
      ) => {
        const commit = await this.getLatestCommit();
        const hash = keccakStr(`${commit.index}:${context.calldata}`);
        history.show = [commit.index, shortHash(hash)];
        return this.callLRU.cache(hash, async () => {
          const req = new GatewayRequestV1(target, commands, constants);
          return getBytes(await this.handleRequest(commit, req));
        });
      },
    });
  }
  getLatestCommit() {
    return this.latestCache.get();
  }
  // since every legacy gateway does "its own thing"
  // we forward the responsibility of generating a response
  abstract handleRequest(
    commit: RollupCommitType<R>,
    request: GatewayRequestV1
  ): Promise<HexString>;
}
