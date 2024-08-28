import { type AbiParametersToPrimitiveTypes, type ParseAbiItem } from 'abitype';
import {
  encodeAbiParameters,
  encodePacked,
  keccak256,
  toHex,
  type AbiFunction,
  type Address,
  type Hex,
} from 'viem';

import { CachedMap, CachedValue } from './cached.js';
import {
  AbstractRollupV1,
  type AbstractRollup,
  type RollupCommit,
} from './rollup.js';
import { EVMRequestV1 } from './v1.js';
import type { AbstractProver } from './vm.js';

type ParseAbiFunction<signature extends string> =
  ParseAbiItem<signature> extends AbiFunction ? ParseAbiItem<signature> : never;

type AddAbiHandlerParameters<signature extends string> = {
  type: signature;
  handle: AbiFunctionHandler<ParseAbiFunction<signature>>;
};

type RpcRequest = {
  to: Address;
  data: Hex;
};
export type AbiFunctionHandler<
  abiFunc extends AbiFunction,
  returnType extends AbiParametersToPrimitiveTypes<abiFunc['outputs']> | Hex =
    | AbiParametersToPrimitiveTypes<abiFunc['outputs']>
    | Hex,
> = (
  args: AbiParametersToPrimitiveTypes<abiFunc['inputs']>,
  req: RpcRequest
) => Promise<returnType> | returnType;
export type GenericRouter = {
  add: <signature extends string>(
    params: AddAbiHandlerParameters<signature>
  ) => void;
};

const proveRequestAbiSnippet =
  'function proveRequest(bytes context, (bytes ops, bytes[] inputs)) returns (bytes)' as const;
const getStorageSlotsAbiSnippet =
  'function getStorageSlots(address target, bytes32[] commands, bytes[] constants) returns (bytes)' as const;

export const GATEWAY_ABI = [proveRequestAbiSnippet, getStorageSlotsAbiSnippet];

export class Gateway<
  P extends AbstractProver,
  C extends RollupCommit<P>,
  R extends AbstractRollup<C>,
> {
  commitDepth = 3;
  allowHistorical = false;
  private readonly latestCache = new CachedValue(
    () => this.rollup.fetchLatestCommitIndex(),
    60000
  );
  private readonly commitCacheMap = new CachedMap<bigint, C>(Infinity);
  private readonly parentCacheMap = new CachedMap<bigint, bigint>(Infinity);
  readonly callCacheMap = new CachedMap<string, Hex>(Infinity, 1000);
  constructor(readonly rollup: R) {}

  register<router extends GenericRouter>(router: router) {
    router.add({
      type: proveRequestAbiSnippet,
      handle: async ([ctx, { ops, inputs }]) => {
        const commit = await this.getRecentCommit(BigInt(ctx));
        const hash = keccak256(
          encodePacked(
            ['uint256', 'bytes', 'bytes[]'],
            [commit.index, ops, inputs]
          )
        );
        return this.callCacheMap.get(hash, async () => {
          const state = await commit.prover.evalDecoded(ops, inputs);
          const { proofs, order } = await commit.prover.prove(state.needs);
          return this.rollup.encodeWitness(commit, proofs, order);
        });
      },
    });

    const rollup = this.rollup;
    if (rollup instanceof AbstractRollupV1) {
      router.add({
        type: getStorageSlotsAbiSnippet,
        handle: async ([target, commands, constants], context) => {
          const commit = await this.getLatestCommit();
          const hash = keccak256(toHex(`${commit.index}:${context.data}`));
          return this.callCacheMap.get(hash, async () => {
            const req = new EVMRequestV1(
              target,
              [...commands],
              [...constants]
            ).v2(); // upgrade v1 to v2
            const state = await commit.prover.evalRequest(req);
            const { proofs, order } = await commit.prover.prove(state.needs);
            const witness = rollup.encodeWitnessV1(
              commit,
              proofs[order[0]],
              Array.from(order.slice(1), (i) => proofs[i])
            );
            return encodeAbiParameters([{ type: 'bytes' }], [witness]);
          });
        },
      });
    }
  }

  async getLatestCommit() {
    // check if the commit changed
    const prev = await this.latestCache.value;
    const next = await this.latestCache.get();
    const commit = await this.cachedCommit(next);
    const max = this.commitDepth + 1;
    if (prev !== next && this.commitCacheMap.cachedSize > max) {
      // purge the oldest if we have too many
      const old = [...this.commitCacheMap.cachedKeys()].sort().slice(0, -max);
      for (const key of old) {
        this.commitCacheMap.delete(key);
      }
    }
    return commit;
  }
  async getRecentCommit(index: bigint) {
    let commit = await this.getLatestCommit();
    for (let depth = 0; ; ) {
      if (index >= commit.index) return commit;
      if (++depth >= this.commitDepth) break;
      const prevIndex = await this.cachedParentCommitIndex(commit);
      commit = await this.cachedCommit(prevIndex);
    }
    if (this.allowHistorical) {
      return this.commitCacheMap.get(
        index,
        (i) => this.rollup.fetchCommit(i),
        0 // dont cache it
      );
    }
    throw new Error(`too old: ${index}`);
  }
  private async cachedParentCommitIndex(commit: C): Promise<bigint> {
    return this.parentCacheMap.get(commit.index, async () => {
      const index = await this.rollup.fetchParentCommitIndex(commit);
      if (index < 0) throw new Error(`no parent commit: ${commit.index}`);
      return index;
    });
  }
  private async cachedCommit(index: bigint) {
    return this.commitCacheMap.get(index, (i) => this.rollup.fetchCommit(i));
  }
}
