import { Chain } from './types.js';
import { withResolvers } from './utils.js';
import {
  JsonRpcPayload,
  JsonRpcProvider,
  JsonRpcResult,
} from 'ethers/providers';
import { FetchRequest } from 'ethers/utils';

function shouldNeverBatch(payload: JsonRpcPayload) {
  // see: LineaProver.ts:fetchProofs()
  return payload.method === 'linea_getProof';
}

export class GatewayProvider extends JsonRpcProvider {
  // convenience
  static async http(url: string) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        method: 'eth_chainId',
        params: [],
        id: 1,
        jsonrpc: '2.0',
      }),
    });
    const { result, error } = await res.json();
    if (!res.ok || error) throw new Error(error?.message ?? 'expected rpc');
    return new this(new FetchRequest(url), BigInt(result));
  }
  constructor(
    fr: FetchRequest,
    readonly chain: Chain,
    // 20250107: infura/alchemy lowered limit to 10
    // TODO: make this a provider-specific setting?
    batchMaxCount = 10
  ) {
    super(fr, chain, { staticNetwork: true, batchMaxCount });
  }
  override async _send(
    payload: JsonRpcPayload | JsonRpcPayload[]
  ): Promise<JsonRpcResult[]> {
    if (Array.isArray(payload) && payload.length > 1) {
      // determine if any of the payloads cant be batched
      const ps: Promise<any>[] = [];
      const batch: JsonRpcPayload[] = [];
      const { promise, resolve, reject } = withResolvers<JsonRpcResult[]>();
      const ret = payload.map((x) => {
        if (shouldNeverBatch(x)) {
          const p = this._sendWithRetry(x).then((x) => x[0]);
          ps.push(p);
          return p;
        } else {
          const i = batch.length;
          batch.push(x);
          return promise.then((v) => v[i]);
        }
      });
      if (batch.length) {
        ps.push(this._sendWithRetry(batch).then(resolve, reject));
        await Promise.all(ps);
      }
      return Promise.all(ret);
    }
    return this._sendWithRetry(payload);
  }
  async _sendWithRetry(
    payload: JsonRpcPayload | JsonRpcPayload[]
  ): Promise<JsonRpcResult[]> {
    let backoff = 250;
    for (let attempt = 0; ; attempt++) {
      try {
        // ethers bug: return type is wrong
        // expected: (JsonRpcResult | JsonRpcError)[]
        const results: any[] = await super._send(payload);
        if (!results.some((x) => x.error?.code === 429)) {
          // handle alchemy weirdness
          // note: this is only supposed to happen over WebSocket
          // note: there is no header "retry-after"
          // https://docs.alchemy.com/reference/throughput
          return results;
        }
      } catch (err) {
        if (
          err instanceof Error &&
          !Array.isArray(payload) &&
          payload.method == 'eth_getProof' &&
          'code' in err &&
          (err.code === 'UNKNOWN_ERROR' || err.code === 'TIMEOUT')
        ) {
          // eth_getProof failed
          // this is to deal with erigon polygon rpcs
        } else {
          throw err;
        }
      }
      this.emit('debug', { action: 'retry', attempt });
      await new Promise((ful) => setTimeout(ful, backoff));
      backoff *= 2;
    }
  }
}
