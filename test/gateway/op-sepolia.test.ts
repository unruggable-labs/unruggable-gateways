import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { testOPFault } from './common.js';

testOPFault(OPFaultRollup.sepoliaConfig, {
  // https://sepolia-optimism.etherscan.io/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
  slotDataContract: '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
  // https://sepolia-optimism.etherscan.io/address/0x433F956Aa4E72DA4Da098416fD07e061b23fa73F#code
  slotDataPointer: '0x433F956Aa4E72DA4Da098416fD07e061b23fa73F',
  skipCI: true,
});
