import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { testArbitrum } from './common.js';

// TODO: check this 20250222
testArbitrum(BoLDRollup.arbNovaMainnetConfig, {
  // https://nova.arbiscan.io/address/0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6#code
  slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
  // https://nova.arbiscan.io/address/0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05#code
  slotDataPointer: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
  skipCI: true,
});
