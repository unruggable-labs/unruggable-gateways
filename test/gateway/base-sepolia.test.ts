import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { testOPFault } from './common.js';

testOPFault(OPFaultRollup.baseSepoliaConfig, {
  // https://sepolia.basescan.org/address/0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411#code
  slotDataContract: '0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411',
  // https://sepolia.basescan.org/address/0x2D70842D1a1d6413Ce44d0D5FD4AcFDc485540EA#code
  slotDataPointer: '0x2D70842D1a1d6413Ce44d0D5FD4AcFDc485540EA',
  skipCI: true
});
