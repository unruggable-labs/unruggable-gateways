
import {Foundry} from '@adraffy/blocksmith';
import {providerURL} from '../providers.js';
import { CHAINS } from '../../src/chains.js';
import {runSlotDataTests} from '../gateway/tests.js';

import {describe} from '../bun-describe-fix.js';
import { afterAll } from 'bun:test';

describe('test gateway direct', async () => {

	const foundry = await Foundry.launch({
		fork: providerURL(CHAINS.SEPOLIA)
	});
	afterAll(foundry.shutdown);

	const contract = await foundry.deploy({
		file: 'SlotDataReader',
		args: ['0x74F55F0af743f9CA5db0202fc81f589c5fDf99D4', '0xc695404735e0f1587a5398a06cab34d7d7b009da'],
	});

	runSlotDataTests(contract);

});

