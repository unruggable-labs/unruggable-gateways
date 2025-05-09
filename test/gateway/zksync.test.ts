import { ZKSyncRollup } from '../../src/zksync/ZKSyncRollup.js';
import { testZKSync } from './common.js';

testZKSync(ZKSyncRollup.mainnetConfig, {
  // https://explorer.zksync.io/address/0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc#contract
  slotDataContract: '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc',
  // https://explorer.zksync.io/address/0x8D42501ADE3d0D02033B7FB6FfEa338828a1A467#contract
  slotDataPointer: '0x8D42501ADE3d0D02033B7FB6FfEa338828a1A467',
  skipCI: true,
});
