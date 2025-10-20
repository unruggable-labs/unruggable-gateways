import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { testOPFault } from './common.js';

testOPFault(OPFaultRollup.celoMainnetConfig, {
  // https://celo.blockscout.com/address/0xa969922E98dB2C94dE11717eF3eBc7B7A9008e22?tab=contract
  slotDataContract: '0xa969922E98dB2C94dE11717eF3eBc7B7A9008e22',
  // https://celo.blockscout.com/address/0xaD85E1DcfF8adA5420EcB5095D3CCd9bC2e26404?tab=contract
  slotDataPointer: '0xaD85E1DcfF8adA5420EcB5095D3CCd9bC2e26404',
  skipCI: true,
});
