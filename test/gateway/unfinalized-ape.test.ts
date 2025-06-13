import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { NitroRollup } from '../../src/arbitrum/NitroRollup.js';
import { testDoubleArbitrum } from './common.js';

testDoubleArbitrum(BoLDRollup.arb1MainnetConfig, NitroRollup.apeMainnetConfig, {
  // https://apescan.io/address/0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6#code
  slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
  // https://apescan.io/address/0x06d349C4DdF4b6003bF3Eae0A67e6B9838E16667#code
  slotDataPointer: '0x06d349C4DdF4b6003bF3Eae0A67e6B9838E16667',
  skipCI: true,
  minAgeBlocks12: 1,
});
