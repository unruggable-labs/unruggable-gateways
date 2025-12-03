// https://eip.tools/eip/eip-2935.md

import { fetchBlock, fetchStorage, toPaddedHex } from '../../../src/utils.js';
import { CHAINS } from '../../../src/chains.js';
import { createProvider } from '../../providers.js';

const HISTORY_STORAGE_ADDRESS = '0x0000F90827F1C53a10cb7A02335B175320002935';
const HISTORY_BUFFER_LENGTH = 8191;
const BLOCK_TAG = 'finalized';

const provider = createProvider(CHAINS.MAINNET);

const blockInfo = await fetchBlock(provider, BLOCK_TAG);
if (!blockInfo) throw new Error('wtf');

const blockHash = await provider.call({
  to: HISTORY_STORAGE_ADDRESS,
  data: toPaddedHex(blockInfo.number),
});

const storage = await fetchStorage(
  provider,
  HISTORY_STORAGE_ADDRESS,
  (parseInt(blockInfo.number) - 1) % HISTORY_BUFFER_LENGTH,
  BLOCK_TAG
);

console.log(blockInfo.hash);
console.log(blockHash);
console.log();
console.log(blockInfo.parentHash);
console.log(storage);
