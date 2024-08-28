import type { Foundry } from '@adraffy/blocksmith';
import { createClient, webSocket } from 'viem';

export const createFoundryClient = (foundry: Foundry) =>
  createClient({
    transport: webSocket(foundry.endpoint, { retryCount: 0 }),
  });
