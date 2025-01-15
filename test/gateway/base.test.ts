import { OPFaultRollup } from '../../src/op/OPFaultRollup.js';
import { testOPFault } from './common.js';

// 20241030: base changed to fault proofs
// https://base.mirror.xyz/eOsedW4tm8MU5OhdGK107A9wsn-aU7MAb8f3edgX5Tk
// https://twitter.com/base/status/1851672364439814529
testOPFault(OPFaultRollup.baseMainnetConfig, {
  // https://basescan.org/address/0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6
  slotDataContract: '0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6',
  // https://basescan.org/address/0x972433d30b6b78C05ADf32972F7b8485C112E055
  slotDataPointer: '0x972433d30b6b78C05ADf32972F7b8485C112E055',
});
