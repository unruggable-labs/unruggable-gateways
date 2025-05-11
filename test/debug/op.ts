import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { OPBatchInboxRollup } from '../../src/op/OPBatchInboxRollup.js';
import { beaconURL, createProviderPair } from '../providers.js';

const config = OPFaultRollup.baseMainnetConfig;
const rollup = new OPBatchInboxRollup(createProviderPair(config), config, beaconURL(config.chain1));


console.log(await rollup.fetchLatestCommit());
