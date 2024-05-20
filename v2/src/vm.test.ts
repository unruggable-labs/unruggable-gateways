import {EVMProver as EVMProver, EVMRequest} from './vm.js';
import {ethers} from 'ethers';

let vm = await EVMProver.latest(new ethers.InfuraProvider());

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

// #0: mapping (bytes32 => Record) records; => struct Record { address owner; address resolver;	uint64 ttl; }
// #1: mapping (address => mapping(address => bool)) operators;
// #2: ENS _old

let output = await vm.createOutput(ENS_REGISTRY, 2n, 0);
console.log(output);
console.log(await EVMProver.resolved([output])); // 0x314159265dD8dbb310642f98f50C066173C1259b

let r = EVMRequest.create();
r.push(ENS_REGISTRY);
r.target();
r.push(0);
r.follow();
r.collect(0); // owner of root: 0xaB528d626EC275E3faD363fF1393A41F581c5897
console.log(await vm.execute(r)); 
