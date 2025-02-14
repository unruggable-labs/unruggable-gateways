import { ZKSyncRollup } from '../../src/zksync/ZKSyncRollup.js';
import { testZKSync } from './common.js';

testZKSync(ZKSyncRollup.zeroMainnetConfig, {
  // https://explorer.zero.network/address/0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc?network=zero_network
  // https://zerion-explorer.vercel.app/address/0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc#contract
  slotDataContract: '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc',
  skipCI: true,
});
