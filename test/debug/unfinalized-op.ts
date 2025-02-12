import { createProviderPair } from '../providers.js';
import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';

const config = OPFaultRollup.baseSepoliaConfig;
for (const minAgeSec of [0, 86400, 3600, 1]) {
  const rollup = new OPFaultRollup(
    createProviderPair(config),
    config,
    minAgeSec
  );
  const index = await rollup.fetchLatestCommitIndex();
  console.log(minAgeSec, index);
}
