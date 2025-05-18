import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { testLinea } from './common.js';

testLinea(LineaRollup.mainnetConfig, {
  // https://lineascan.build/address/0x48F5931C5Dbc2cD9218ba085ce87740157326F59#code
  slotDataContract: '0x48F5931C5Dbc2cD9218ba085ce87740157326F59',
  // https://lineascan.build/address/0xDeF531a66D7eA1d4E038acABF7F5D1Bd2b306891#code
  slotDataPointer: '0xDeF531a66D7eA1d4E038acABF7F5D1Bd2b306891',
  // 20250518: while there are shomei issues
  // currentL2BlockNumber() = 19123323
  // isShomeiReady() @ 18985856 => 137467 blocks * 2sec/block = 3.2 days
  window: 5 * 86400,
});
