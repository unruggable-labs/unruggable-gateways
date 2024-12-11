import { ZKSyncRollup } from '../../src/zksync/ZKSyncRollup.js';
import { testZKSync } from './common.js';

// TODO: check this in few days
testZKSync(ZKSyncRollup.zeroSepoliaConfig, {
  // https://explorer.zero.network/address/0x51050ec063d393217B436747617aD1C2285Aeeee?network=zerion_testnet
  slotDataContract: '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc',
  skipCI: true,
});
