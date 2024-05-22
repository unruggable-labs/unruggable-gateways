import {EVMRequest, EVMProver} from '../src/vm.js';
import {Foundry} from '@adraffy/blocksmith';
// import {ethers} from 'ethers';
// import {decodeType} from './utils.js';
// import assert from 'node:assert/strict';


let foundry = await Foundry.launch();

let contract = await foundry.deploy({sol: `
	contract X {
		mapping (uint256 => uint256) map;
		constructor() {
			map[1] = 2;
		}
	}
`});

let prover = await EVMProver.latest(foundry.provider);

// claim: FOLLOW = PUSH_SLOT CONCAT(2) KECCAK SET
let r1 = new EVMRequest().setTarget(contract.target).element(1).getValue();
let r2 = new EVMRequest().setTarget(contract.target).push(1).pushSlotRegister().concat(2).keccak().set().getValue();

console.log(r1.ops);
console.log(r2.ops);

console.log(await prover.execute(r1));
console.log(await prover.execute(r1));

await foundry.shutdown();
