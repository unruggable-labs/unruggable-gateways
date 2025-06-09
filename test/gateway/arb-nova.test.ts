import { BoLDRollup } from '../../src/arbitrum/BoLDRollup.js';
import { testArbitrum } from './common.js';

testArbitrum(BoLDRollup.arbNovaMainnetConfig, {
  // https://nova.arbiscan.io/address/0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6#code
  slotDataContract: '0x0d3e01829E8364DeC0e7475ca06B5c73dbA33ef6',
  // https://nova.arbiscan.io/address/0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8#code
  slotDataPointer: '0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8',
  skipCI: true,
});
