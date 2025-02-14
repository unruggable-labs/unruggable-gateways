import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

testOP(OPRollup.zircuitMainnetConfig, {
  // https://explorer.zircuit.com/address/0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6?activeTab=3
  slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
  // https://explorer.zircuit.com/address/0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05?activeTab=3
  slotDataPointer: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
  skipCI: true,
});
