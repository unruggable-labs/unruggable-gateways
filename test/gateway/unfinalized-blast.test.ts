import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

testOP(
  { ...OPRollup.blastMainnnetConfig, minAgeSec: 5000 },
  {
    // https://blastscan.io/address/0xD2CBC073e564b1F30AD7dF3e99a1285e8b7Df8c7#code
    slotDataContract: '0xD2CBC073e564b1F30AD7dF3e99a1285e8b7Df8c7',
    skipCI: true,
  }
);
