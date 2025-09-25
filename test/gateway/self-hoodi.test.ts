import { testSelfEth } from './common.js';
import { CHAINS } from '../../src/chains.js';

testSelfEth(CHAINS.HOODI, {
  // https://hoodi.etherscan.io/address/0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05#code
  slotDataContract: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
  // https://hoodi.etherscan.io/address/0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8#code
  slotDataPointer: '0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8',
});
