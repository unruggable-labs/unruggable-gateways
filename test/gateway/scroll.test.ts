import { EuclidRollup } from '../../src/scroll/EuclidRollup.js';
import { testScroll } from './common.js';

testScroll(EuclidRollup.mainnetConfig, {
  // https://scrollscan.com/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
  slotDataContract: '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
  // https://scrollscan.com/address/0x28507d851729c12F193019c7b05D916D53e9Cf57#code
  slotDataPointer: '0x28507d851729c12F193019c7b05D916D53e9Cf57',
});
