import type { Serve } from 'bun';
import { parseArgs } from 'node:util';
import { toUtf8String } from 'ethers';
import { Fetcher } from '../src/fetcher.js';
import { flattenErrors, toUnpaddedHex } from '../src/utils.js';
import type { RPCEthGetBlock, RPCEthGetProof } from '../src/eth/types.js';
import {
  Coder,
  type MaybeNode,
  copyNode,
  findLeaf,
  getProof,
  graftLimb,
  keccak256,
  toBytes,
  toHex,
  toNibblePath,
} from '@ensdomains/merkle-builder';
import type { Chain } from '../src/types.js';
import { chainFromName, chainName } from '../src/chains.js';
import {
  isRollupDeployment,
  type RollupDeployment,
  type RollupWitnessEncoder,
} from '../src/rollup.js';
import { SlaveGateway } from '../src/gateway-slave.js';
import { EthProver } from '../src/eth/EthProver.js';
import { OPFaultRollup, type OPFaultCommit } from '../src/op/OPFaultRollup.js';
import { NitroRollup, type NitroCommit } from '../src/arbitrum/NitroRollup.js';
import { EuclidCommit, EuclidRollup } from '../src/index.js';

const args = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', short: 'p', default: '8000' },
  },
  strict: true,
});

const chain = chainFromName(args.positionals[0]);
const { witnessEncoder, commitDecoder } = determineCoder(chain);

const masters = args.positionals.slice(1);
if (!masters.length) masters.push('http://localhost:8050');
const fetcher = new Fetcher(masters);

const port = parseInt(args.values.port);
console.log(`Port: ${port}`);

const gateway = new SlaveGateway(
  fetcher,
  async (index, commitObj) => {
    console.log('Commit:', index);
    console.time('fetchCommit');
    const coder = new Coder(
      await gateway.fetcher.fetchBytes(`/commit?index=${toUnpaddedHex(index)}`)
    );
    console.timeEnd('fetchCommit');
    console.time('decodeCommit');
    const block: RPCEthGetBlock = JSON.parse(
      toUtf8String(coder.readSizedBytes())
    );
    Object.assign(commitObj, commitDecoder(coder, block));
    const proof: RPCEthGetProof = JSON.parse(
      toUtf8String(coder.readSizedBytes())
    );
    const trunk = coder.readNode();
    const limbs = new Map<string, MaybeNode>();
    const depth = coder.readSize();
    while (coder.pos < coder.buf.length) {
      limbs.set(toHex(coder.readBytes(depth)), coder.readNode());
    }
    console.timeEnd('comdecodeCommitmit');
    const prover = new EthProver(
      {
        async send(method, params) {
          if (Array.isArray(params)) {
            switch (method) {
              case 'eth_getStorageAt': {
                checkContext(params[0], params[2]);
                const slot = toBytes(params[1], 32);
                const path = toNibblePath(keccak256(slot));
                const part = path.subarray(0, depth);
                let node = copyNode(trunk);
                const limb = limbs.get(toHex(part));
                if (limb) node = graftLimb(node, [part, limb]);
                const leaf = findLeaf(node, path);
                const word = new Uint8Array(32);
                if (leaf) word.set(leaf.data, 32 - leaf.data.length);
                return toHex(word);
              }
              case 'eth_getProof': {
                checkContext(params[0], params[2]);
                // compute slot storage requirements
                const slots = (params[1] as string[]).map((hexSlot, i) => {
                  const slot = toBytes(hexSlot, 32);
                  const path = toNibblePath(keccak256(slot));
                  const part = path.subarray(0, depth);
                  const partKey = toHex(part);
                  return { slot, path, part, partKey, i };
                });
                // group by limb prefix
                const buckets = new Map<string, typeof slots>();
                for (const x of slots) {
                  let v = buckets.get(x.partKey);
                  if (!v) buckets.set(x.partKey, (v = []));
                  v.push(x);
                }
                // genereate proofs with minimal memory usage
                proof.storageProof = [];
                for (const [partKey, bucket] of buckets) {
                  const limb = limbs.get(partKey);
                  const node = limb
                    ? graftLimb(copyNode(trunk), [bucket[0].part, limb]) // copy to preserve trunk
                    : trunk;
                  for (const x of bucket) {
                    const leaf = findLeaf(node, x.path);
                    proof.storageProof[x.i] = {
                      key: toHex(x.slot),
                      value: leaf?.data.length ? toHex(leaf.data) : '0x0',
                      proof: getProof(node, x.path).map((v) => toHex(v)),
                    };
                  }
                }
                return proof;
              }
            }
          }
          throw new Error('not implemented');
        },
      },
      block.number
    );
    prover.cache.set('BLOCK', block);
    prover.proofLRU.max = 0; // never cache
    prover.proofBatchSize = Infinity; // unlimited
    prover.fast = true; // use getStorageAt
    return prover;
    function checkContext(target: any, blockTag: any) {
      if (target !== proof.address) {
        throw new Error(`unsupported contract: ${target}`);
      }
      if (blockTag !== block.number) {
        throw new Error(`unsupported block: ${blockTag}`);
      }
    }
  },
  witnessEncoder
);

const prefetch = async () => {
  try {
    console.time('prefetch');
    await gateway.latestCache.get();
    console.timeEnd('prefetch');
  } catch (err) {
    console.log(new Date(), `Prefetch failed: ${flattenErrors(err, String)}`);
  }
  setTimeout(prefetch, gateway.latestCache.cacheMs);
};
await prefetch();

const headers = { 'access-control-allow-origin': '*' };
export default {
  port,
  async fetch(req) {
    switch (req.method) {
      case 'OPTIONS': {
        return new Response(null, {
          headers: { ...headers, 'access-control-allow-headers': '*' },
        });
      }
      case 'GET': {
        const commits = gateway.commits.map((x) => ({
          index: toUnpaddedHex(x.index),
        }));
        return Response.json(
          { gateways: gateway.fetcher.urls, commits },
          { headers }
        );
      }
      case 'POST': {
        const t0 = performance.now();
        try {
          const { sender, data: calldata } = await req.json();
          const { data, history } = await gateway.handleRead(sender, calldata, {
            protocol: 'raw',
          });
          console.log(
            new Date(),
            history.toString(),
            Math.round(performance.now() - t0)
          );
          return Response.json({ data }, { headers });
        } catch (err) {
          console.log(new Date(), flattenErrors(err, String));
          return Response.json(
            { error: flattenErrors(err) },
            { headers, status: 500 }
          );
        }
      }
      default: {
        return new Response('unsupported', { status: 405 });
      }
    }
  },
} satisfies Serve;

function determineCoder(chain: Chain): {
  witnessEncoder: RollupWitnessEncoder;
  commitDecoder: (coder: Coder, block: RPCEthGetBlock) => any;
} {
  {
    const c = deployments(OPFaultRollup).find((x) => x.chain2 === chain);
    if (c) {
      return {
        witnessEncoder: OPFaultRollup.witnessEncoder,
        commitDecoder(coder, block) {
          return {
            blockHash: block.hash,
            stateRoot: block.stateRoot,
            passerRoot: toHex(coder.readBytes(32)),
          } satisfies Omit<OPFaultCommit, 'index' | 'prover' | 'game'>;
        },
      };
    }
  }
  {
    const c = deployments(NitroRollup).find((x) => x.chain2 === chain);
    if (c) {
      return {
        witnessEncoder: NitroRollup.witnessEncoder,
        commitDecoder(coder) {
          return {
            encodedRollupProof: toHex(coder.readSizedBytes()),
            prevNum: BigInt(toHex(coder.readSizedBytes())),
          } satisfies Omit<NitroCommit, 'index' | 'prover'>;
        },
      };
    }
  }
  {
    const c = deployments(EuclidRollup).find((x) => x.chain2 === chain);
    if (c) {
      return {
        witnessEncoder: EuclidRollup.witnessEncoder,
        commitDecoder() {
          return {} satisfies Omit<
            EuclidCommit,
            'index' | 'prover' | 'l1BlockNumber'
          >;
        },
      };
    }
  }
  throw new Error(`unimplemented chain: ${chainName(chain)}`);
}

function deployments<C>(rollupClass: object): RollupDeployment<C>[] {
  return Object.values(rollupClass).filter(isRollupDeployment<C>);
}
