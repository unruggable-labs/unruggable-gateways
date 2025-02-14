import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

testOP(OPRollup.liskSepoliaConfig, {
  // https://sepolia-blockscout.lisk.com/address/0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8?tab=contract
  slotDataContract: '0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8',
  // https://sepolia-blockscout.lisk.com/address/0xb3664493FB8414d3Dad1275aC0E8a12Ef859694d?tab=contract
  slotDataPointer: '0xb3664493FB8414d3Dad1275aC0E8a12Ef859694d',
  skipCI: true,
});
