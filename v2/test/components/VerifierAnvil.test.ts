import type {HexString} from '../../src/types.js';
import {ethers} from 'ethers';
import {Foundry} from '@adraffy/blocksmith';
import {EVMProver, EVMRequest} from '../../src/vm.js';
import {decodeStorageArray} from '../utils.js';
import {test, afterAll, expect} from 'bun:test';

function random32(): HexString {
	return ethers.hexlify(ethers.randomBytes(32));
}

async function setup() {
	let foundry = await Foundry.launch({infoLog: false});
	afterAll(() => foundry.shutdown());
	let verifier = await foundry.deploy({sol: `
		import "@src/EVMProofHelper.sol";
		contract Verifier {
			function getStorageValues(
				EVMRequest memory req, 
				bytes32 stateRoot, 
				bytes[][] memory accountProofs, 
				StateProof[] memory stateProofs
			) external pure returns(bytes[] memory) {
				return EVMProofHelper.getStorageValues(req, stateRoot, accountProofs, stateProofs);
			}
		}
	`});
	return {
		foundry,
		verifier,
		async prover() {
			let prover = await EVMProver.latest(this.foundry.provider);
			let stateRoot = await prover.getStateRoot();
			return {
				prover,
				stateRoot,
				async prove(r: EVMRequest): Promise<HexString[]> {
					let outputs = await this.prover.eval(r.ops, r.inputs);
					let [accountProofs, stateProofs] = await this.prover.prove(outputs);
					//console.log(await EVMProver.resolved(outputs));
					return verifier.getStorageValues([r.ops, r.inputs], this.stateRoot, accountProofs, stateProofs);
				}
			};
		}
	};
}

test('getValue()', async () => {
	const VALUE = random32();
	let T = await setup();
	let C = await T.foundry.deploy({sol: `
		contract X {
			uint256 slot0 = ${VALUE};
		}
	`});
	let P = await T.prover();
	let V = await P.prove(new EVMRequest().setTarget(C.target).getValue());
	expect(V).toHaveLength(1);
	expect(V[0]).toStrictEqual(VALUE);
});

test('getValue(), random', async () => {
	const XY = Array.from({length: 5}, () => {
		return [random32(), random32()];
	})
	let T = await setup();
	let C = await T.foundry.deploy({sol: `
		contract X {
			constructor() {
				assembly {
					${XY.map(([x, y]) => `sstore(${x}, ${y})`).join('\n')}
				}
			}
		}
	`});
	let P = await T.prover();
	let r = new EVMRequest().setTarget(C.target);
	XY.forEach(([x]) => r.setSlot(x).getValue());
	let V = await P.prove(r);
	expect(V).toHaveLength(XY.length);
	XY.forEach(([x, y], i) => expect(V[i]).toStrictEqual(y));
});

test('getBytes()', async () => {
	const SMALL = 'chonk';
	const LARGE = SMALL.repeat(13);
	let T = await setup();
	let C = await T.foundry.deploy({sol: `
		contract X {
			string small = "${SMALL}";
			string large = "${LARGE}";
		}
	`});
	let P = await T.prover();
	let V = await P.prove(new EVMRequest().setTarget(C.target).getBytes().setSlot(1).getBytes());
	expect(V).toHaveLength(2);
	expect(ethers.toUtf8String(V[0])).toStrictEqual(SMALL);
	expect(ethers.toUtf8String(V[1])).toStrictEqual(LARGE);
});

test('getValues()', async () => {
	const VALUES = Array.from({length: 5}, random32);
	let T = await setup();
	let C = await T.foundry.deploy({sol: `
		contract X {
			${VALUES.map((x, i) => `uint256 slot${i} = ${x};`).join('\n')}
		}
	`});
	let P = await T.prover();
	let V = await P.prove(new EVMRequest().setTarget(C.target).getValues(VALUES.length));
	expect(V).toHaveLength(1);
	expect(V[0]).toStrictEqual(ethers.concat(VALUES));
});

test('bool[]', async () => {
	const VALUES = Array.from({length: 37}, () => Math.random() < 0.5);
	let T = await setup();
	let C = await T.foundry.deploy({sol: `
		contract X {
			bool[] v = [${VALUES}];
		}
	`});
	let P = await T.prover();
	let V = await P.prove(new EVMRequest().setTarget(C.target).collect(1));
	expect(V).toHaveLength(1);
	expect(decodeStorageArray(1, V[0]).map(x => !!parseInt(x))).toStrictEqual(VALUES);
});

for (let N = 1; N <= 32; N++) {
//for (let N of [19, 20, 21]) {
	const W = N << 3;
	test(`uint${W}[]`, async () => {
		const VALUES = Array.from({length: 17}, (_, i) => ethers.toBeHex(i, N));
		let T = await setup();
		let C = await T.foundry.deploy({sol: `
			contract X {
				uint${W}[] v = [${VALUES.map(x => `uint${W}(${N == 20 ? ethers.getAddress(x) : x})`)}]; // solc bug?
			}
		`});
		let P = await T.prover();
		let V = await P.prove(new EVMRequest().setTarget(C.target).collect(N));
		expect(V).toHaveLength(1);
		expect(decodeStorageArray(N, V[0])).toStrictEqual(VALUES);
	});
}

for (let N = 1; N <= 32; N++) {
//for (let N of [19, 20, 21]) {
	test(`bytes${N}[]`, async () => {
		const VALUES = Array.from({length: Math.ceil(247 / N)}, (_, i) => ethers.toBeHex(i, N));
		let T = await setup();
		let C = await T.foundry.deploy({sol: `
			contract X {
				bytes${N}[] v = [${VALUES.map(x => `bytes${N}(${N == 20 ? ethers.getAddress(x) : x})`)}]; // solc bug?
			}
		`});
		let P = await T.prover();
		let V = await P.prove(new EVMRequest().setTarget(C.target).collect(N));
		expect(V).toHaveLength(1);
		expect(decodeStorageArray(N, V[0])).toStrictEqual(VALUES);
	});
}

