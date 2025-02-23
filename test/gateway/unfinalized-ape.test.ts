import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { NitroRollup } from '../../src/arbitrum/NitroRollup.js';
import { testDoubleArbitrum } from './common.js';

testDoubleArbitrum(BoLDRollup.arb1MainnetConfig, NitroRollup.apeMainnetConfig, {
  // https://apescan.io/address/0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6#code
  slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
  // https://apescan.io/address/0x4C600c1ee9c81Be765387B7659347fc036D3dE6C#code
  //slotDataPointer: '0x4C600c1ee9c81Be765387B7659347fc036D3dE6C',
  skipCI: true,
  minAgeBlocks12: 1,
});
