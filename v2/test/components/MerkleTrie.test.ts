import type {HexString, BigNumberish} from '../../src/types.js';
import {EVMProver} from '../../src/vm.js';
import {proveAccountState, proveStorageValue, NULL_TRIE_HASH} from '../../src/merkle.js';
import {Foundry} from '@adraffy/blocksmith';
import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {afterAll, test} from 'bun:test';

// create a test builder because bun:test is retarded
async function setup() {
	let foundry = await Foundry.launch({infoLog: false});
	afterAll(() => foundry.shutdown());
	await foundry.nextBlock(); // force mine a block
	return {
		foundry,
		async prover() {
			let prover = await EVMProver.latest(foundry.provider);
			return {
				async assertDoesNotExist(target: HexString) {
					let stateRoot = await prover.getStateRoot();
					let output = await prover.createOutput(target, 0n, 0);
					let [[accountProof]] = await prover.prove([output]);
					let accountState = proveAccountState(target, accountProof, stateRoot);
					assert.equal(accountState, undefined);
				},
				async assertValue(target: HexString, slot: BigNumberish, expect: BigNumberish) {
					slot = ethers.getUint(slot);
					let stateRoot = await prover.getStateRoot();
					let output = await prover.createOutput(target, slot, 0);
					let [[accountProof], [[_, [storageProof]]]] = await prover.prove([output]);
					let {storageHash} = await prover.getProof(target, [slot]);
					let accountState = proveAccountState(target, accountProof, stateRoot);
					assert.equal(accountState?.storageRoot, storageHash);
					let slotValue = proveStorageValue(slot, storageProof, storageHash);
					assert.equal(slotValue, await output.value());
					assert.equal(slotValue, ethers.toBeHex(expect, 32));
					let liveValue = await prover.provider.getStorage(target, slot);
					return {
						nullRoot: storageHash === NULL_TRIE_HASH, 
						liveValue,
						slotValue,
						same: liveValue === slotValue,
					};
				}
			}
		}
	}
}


test(`nonexistent EOAs don't exist`, async () => {
	let T = await setup();
	let P = await T.prover();
	for (let i = 0; i < 5; i++) {
		await P.assertDoesNotExist(ethers.toBeHex(1, 20));
	}
});

test('EOA with balance exists', async () => {
	let T = await setup();
	let P = await T.prover();
	let V = await P.assertValue(T.foundry.wallets.admin.address, 0, 0);
	assert(V.nullRoot, 'expected null root');
});

test('empty contract', async () => {
	let T = await setup();
	let C = await T.foundry.deploy({sol: `contract C {}`});
	let P = await T.prover();
	await P.assertValue(C.target, 0, 0);
});

test('slotless contract', async () => {
	let T = await setup();
	let C = await T.foundry.deploy({sol: `
		contract C {
			function set(uint256 slot, uint256 value) external {
				assembly { sstore(slot, value) }
			}
		}
	`});
	let P1 = await T.prover();
	await P1.assertValue(C.target, 0, 0); // unset
	await T.foundry.confirm(C.set(0, 1)); // make change
	await P1.assertValue(C.target, 0, 0); // not visible to prover
	let P2 = await T.prover();            // new prover
	await P2.assertValue(C.target, 0, 1); // visible
});

test('slotted contract', async () => {
	let T = await setup();
	let C = await T.foundry.deploy({sol: `
		contract C {
			uint256 slot0 = 0;
			uint256 slot1 = 1;
			function set(uint256 slot, uint256 value) external {
				assembly { sstore(slot, value) }
			}
		}
	`});
	let P1 = await T.prover();
	await P1.assertValue(C.target, 0, 0); // init
	await P1.assertValue(C.target, 1, 1); // init
	await P1.assertValue(C.target, 2, 0); // unset
	
	await T.foundry.confirm(C.set(0, 1)); // change slot 0
	await T.foundry.confirm(C.set(2, 1)); // change slot 2

	assert.equal(await P1.assertValue(C.target, 0, 0).then(x => x.same), false, 'expected slot(0) is diff');
	assert.equal(await P1.assertValue(C.target, 1, 1).then(x => x.same), true,  'expected slot(1) is same');
	assert.equal(await P1.assertValue(C.target, 2, 0).then(x => x.same), false, 'expected slot(2) is diff');

	let P2 = await T.prover();
	await P2.assertValue(C.target, 0, 1); // new value
	await P2.assertValue(C.target, 2, 1); // new value
});


