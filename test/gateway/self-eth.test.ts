import { testSelfEth } from './common.js';
import { CHAINS } from '../../src/chains.js';

testSelfEth(CHAINS.MAINNET, {
  // https://etherscan.io/address/0xC9D1E777033FB8d17188475CE3D8242D1F4121D5#code
  slotDataContract: '0xC9D1E777033FB8d17188475CE3D8242D1F4121D5',
  // https://etherscan.io/address/0xA537a7A8D9cE405a50d2e8aA00D4623E94E97d71#code
  slotDataPointer: '0xA537a7A8D9cE405a50d2e8aA00D4623E94E97d71',
});
