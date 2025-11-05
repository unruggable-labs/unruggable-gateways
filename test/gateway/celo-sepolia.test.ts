import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { testOPFault } from './common.js';

testOPFault(OPFaultRollup.celoSepoliaConfig, {
  // https://celo-sepolia.blockscout.com/address/0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6
  slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
  // https://celo-sepolia.blockscout.com/address/0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05
  slotDataPointer: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
  skipCI: true,
});
