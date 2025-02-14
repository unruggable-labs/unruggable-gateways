import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { testOPFault } from './common.js';

testOPFault(OPFaultRollup.sepoliaConfig, {
  // https://sepolia-optimism.etherscan.io/address/0xc695404735e0f1587a5398a06cab34d7d7b009da
  slotDataContract: '0xc695404735e0f1587a5398a06cab34d7d7b009da',
  skipCI: true,
  minAgeSec: 1,
});
