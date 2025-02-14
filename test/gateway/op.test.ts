import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { testOPFault } from './common.js';

testOPFault(OPFaultRollup.mainnetConfig, {
  // https://optimistic.etherscan.io/address/0xf9d79d8c09d24e0C47E32778c830C545e78512CF
  slotDataContract: '0xf9d79d8c09d24e0C47E32778c830C545e78512CF',
  // https://optimistic.etherscan.io/address/0x19E3e95804020282246E7C30C45cC77dE70E9dc2
  //slotDataPointer: '0x19E3e95804020282246E7C30C45cC77dE70E9dc2', // TODO: check on 20250117
});
