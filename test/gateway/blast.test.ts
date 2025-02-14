import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

testOP(OPRollup.blastMainnnetConfig, {
  // https://blastscan.io/address/0xD2CBC073e564b1F30AD7dF3e99a1285e8b7Df8c7#code
  slotDataContract: '0xD2CBC073e564b1F30AD7dF3e99a1285e8b7Df8c7',
  // https://blastscan.io/address/0xE387D5f4872A8F8B60B5e15e629d14c3D16f582F#code
  slotDataPointer: '0xE387D5f4872A8F8B60B5e15e629d14c3D16f582F',
  skipCI: true,
});
