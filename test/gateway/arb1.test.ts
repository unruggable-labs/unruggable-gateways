import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { testNitro } from './common.js';

testNitro(NitroRollup.arb1MainnetConfig, {
  // https://arbiscan.io/address/0xCC344B12fcc8512cc5639CeD6556064a8907c8a1#code
  slotDataContract: '0xCC344B12fcc8512cc5639CeD6556064a8907c8a1',
  // https://arbiscan.io/address/0xaB6D328eB7457164Bb4C2AC27b05200B9b688ac3#code
  slotDataPointer: '0xaB6D328eB7457164Bb4C2AC27b05200B9b688ac3',
});
