import {EVMRequest, EVMProver} from '../../src/vm.js';
import {Foundry, type DeployedContract} from '@adraffy/blocksmith';
import {ethers} from 'ethers';
import {test, afterAll, expect} from 'bun:test';

test('ClowesConcatSlice', async () => {

	let foundry = await Foundry.launch({infoLog: false});
	afterAll(() => foundry.shutdown());

	const SIZE  = 73;
	const FIRST = 8;
	const LAST  = 5;
	const VALUE = 1337;

	let data = ethers.hexlify(ethers.randomBytes(SIZE));
	let key = ethers.concat([
		ethers.dataSlice(data, 0, FIRST),
		ethers.dataSlice(data, -LAST)
	]);

	let contract = await foundry.deploy({sol: `
		contract C {
			bytes slot0;
			mapping (bytes => uint256) slot1;
			constructor(bytes memory data, bytes memory key, uint256 value) {
				slot0 = data;
				slot1[key] = value;
			}
		}
	`, args: [data, key, VALUE]});

	let prover = await EVMProver.latest(foundry.provider);

	let r = new EVMRequest()
		.setTarget(contract.target)
		.setSlot(0).getBytes() // #0
		.pushOutput(0).slice(0, FIRST)
		.pushOutput(0).slice(SIZE - LAST, LAST)
		.concat(2)
		.setSlot(1).follow().getValue(); // #1

	let outputs = await prover.execute(r);

	expect(outputs).toHaveLength(2);
	expect(outputs[0].value).toStrictEqual(data);
	expect(outputs[1].value).toStrictEqual(ethers.toBeHex(VALUE, 32));

});


test('PremmRegistryOfRegistries', async () => {
	let foundry = await Foundry.launch({infoLog: false});
	afterAll(() => foundry.shutdown());

	let nodes = Array.from({length: 10}, (_, i) => `${i}`).map((label, i, v) => {
		return {
			label: label,
			name: v.slice(i).join('.'),
			labelhash: ethers.id(label),
		};
	}).reverse();

	async function makeRegistry(label: string) {
		return foundry.deploy({sol: `
			contract Registry {
				mapping (bytes32 => address) _map;
				string _name;
				constructor(string memory name) {
					_name = name;
				}
				function register(bytes32 node, address to) external {
					_map[node] = to;
				}
			}
		`, args: [label]});
	}

	let root = await makeRegistry('root');

	{
		let prev = root;
		for (let node of nodes) {
			let next = await makeRegistry(node.name);
			await foundry.confirm(prev.register(node.labelhash, next));
			prev = next;
		}
	}

	let r = new EVMRequest();
	r.setTarget(root.target);
	
	for (let node of nodes) {
		r.push(node.labelhash).follow().getValue();
		r.pushOutput(r.outputCount-1).target();
	}
	r.setSlot(1).getBytes();

	let prover = await EVMProver.latest(foundry.provider);
	
	console.time('Prove');
	let outputs = await prover.eval(r.ops, r.inputs);
	let [accountProofs, stateProofs] = await prover.prove(outputs);
	console.timeEnd('Prove');

	let values = await EVMProver.resolved(outputs);
	console.log(values);
	expect(ethers.toUtf8String(values[values.length-1].value)).toStrictEqual(nodes[nodes.length-1].name); 

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

	console.time('Verify');
	console.log(await verifier.getStorageValues.estimateGas([r.ops, r.inputs], await prover.getStateRoot(), accountProofs, stateProofs));
	console.timeEnd('Verify');

	let response = ethers.AbiCoder.defaultAbiCoder().encode(['bytes[][]', 'tuple(uint256, bytes[][])[]'], [accountProofs, stateProofs]);
	console.log(`Bytes: ${response.length}`);


});
