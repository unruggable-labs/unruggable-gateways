import {
  DeployedContract,
  Foundry as Foundry_,
  type FoundryBaseOptions,
  type PathLike,
  type ToConsoleLog,
} from '@adraffy/blocksmith';
import { EventEmitter } from 'node:events';
import {
  createClient,
  webSocket,
  type Address,
  type Client,
  type EIP1193RequestFn,
} from 'viem';

type CustomisedFoundry = Omit<Foundry, 'deploy'> & {
  deploy: (
    options: Parameters<Foundry_['deploy']>[0]
  ) => Promise<DeployedContract & { target: Address }>;
};

export class Foundry extends Foundry_ {
  client: Client;
  emitter: EventEmitter;
  static override async launch(
    options?: {
      port?: number;
      chain?: number;
      anvil?: string;
      gasLimit?: number;
      blockSec?: number;
      accounts?: string[];
      autoClose?: boolean; // default: true
      infoLog?: ToConsoleLog; // default: true = console.log()
      procLog?: ToConsoleLog; // default: off
      fork?: PathLike;
      infiniteCallGas?: boolean;
    } & FoundryBaseOptions
  ): Promise<CustomisedFoundry> {
    const f = await super.launch(options);
    const emitter = new EventEmitter();
    const transport = webSocket(f.endpoint, { retryCount: 0 })({});
    const originalRequest = transport.request;
    const requestWithHook: EIP1193RequestFn = async (args, opts) => {
      emitter.emit('debug', {
        action: 'sendRpcPayload',
        payload: args,
      });
      return originalRequest(args, opts);
    };
    transport.request = requestWithHook;
    const client = createClient({
      transport: () => transport,
      cacheTime: 0,
    });
    Object.assign(f, { client, emitter });

    return f as unknown as CustomisedFoundry;
  }
}
