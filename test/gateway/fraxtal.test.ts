import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

testOP(OPRollup.fraxtalMainnetConfig, {
  // https://fraxscan.com/address/0xa5aDB66771314293b2e93BC5492584889c7eeC72#code
  slotDataContract: '0xa5aDB66771314293b2e93BC5492584889c7eeC72',
  // https://fraxscan.com/address/0xaD85E1DcfF8adA5420EcB5095D3CCd9bC2e26404#code
  slotDataPointer: '0xaD85E1DcfF8adA5420EcB5095D3CCd9bC2e26404',
  skipCI: true,
});
