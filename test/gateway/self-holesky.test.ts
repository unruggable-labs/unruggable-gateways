import { testSelfEth } from './common.js';
import { CHAINS } from '../../src/chains.js';

testSelfEth(CHAINS.HOLESKY, {
  // https://holesky.etherscan.io/address/0xB98fc08e1dba6dC0049329d676145b89711e27A8#code
  slotDataContract: '0xB98fc08e1dba6dC0049329d676145b89711e27A8',
  // https://holesky.etherscan.io/address/0xb39a11F27240C91B306d39987aaf7ccaF88aa824#code
  slotDataPointer: '0xb39a11F27240C91B306d39987aaf7ccaF88aa824',
  skipCI: true, // 20250306: probably can include this once Pectra issues are fixed
});
