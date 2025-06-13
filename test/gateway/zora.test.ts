import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { testOPFault } from './common.js';

testOPFault(OPFaultRollup.zoraMainnetConfig, {
  // https://explorer.zora.energy/address/0x73404681064a8e16c22C1411A02D47e6395f6582
  slotDataContract: '0x73404681064a8e16c22C1411A02D47e6395f6582',
  // https://explorer.zora.energy/address/0xBEfeca057ea022e7aB419670a659d32f125973C1
  // slotDataPointer: '0xBEfeca057ea022e7aB419670a659d32f125973C1', // deployed 20250609
  skipCI: true,
});
