import type { ProviderPair } from '../types.js';
import type { ArbitrumConfig } from './ArbitrumRollup.js';
import { NitroRollup } from './NitroRollup.js';
import { BoLDRollup } from './BoLDRollup.js';
import { UnfinalizedBoLDRollup } from './UnfinalizedBoLDRollup.js';

export function createArbitrumRollup(
  providers: ProviderPair,
  config: ArbitrumConfig,
  minAgeBlocks: number = 0
) {
  if (config.isBoLD) {
    if (minAgeBlocks == 0) {
      return new BoLDRollup(providers, config);
    } else {
      return new UnfinalizedBoLDRollup(providers, config, minAgeBlocks);
    }
  } else {
    return new NitroRollup(providers, config, minAgeBlocks);
  }
}
