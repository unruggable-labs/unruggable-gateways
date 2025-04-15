import { TaikoRollup } from '../../src/taiko/TaikoRollup.js';
import { testTaiko } from './common.js';

testTaiko(TaikoRollup.mainnetConfig, {
  // https://taikoscan.io/address/0xAF7f1Fa8D5DF0D9316394433E841321160408565#code
  slotDataContract: '0xAF7f1Fa8D5DF0D9316394433E841321160408565',
  // https://taikoscan.io/address/0x357276B7F176fD896176Bbf873e9606847A6Ef5a#code
  slotDataPointer: '0x357276B7F176fD896176Bbf873e9606847A6Ef5a',
  skipCI: true,
});
