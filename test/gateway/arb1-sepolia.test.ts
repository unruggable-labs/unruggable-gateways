import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { testNitro } from './common.js';

testNitro(NitroRollup.arb1SepoliaConfig, {
  // https://sepolia.arbiscan.io/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
  slotDataContract: '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
  // https://sepolia.arbiscan.io/address/0x433F956Aa4E72DA4Da098416fD07e061b23fa73F#code
  slotDataPointer: '0x433F956Aa4E72DA4Da098416fD07e061b23fa73F',
  skipCI: true,
});
