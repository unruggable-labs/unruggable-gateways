import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

// TODO: check this
testOP(OPRollup.mintMainnetConfig, {
  minAgeSec: 1,
  window: 12 * 60 * 60,
  // https://explorer.mintchain.io/address/0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05?tab=contract
  slotDataContract: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
  // https://explorer.mintchain.io/address/0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8?tab=contract
  slotDataPointer: '0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8',
  skipCI: true,
});
