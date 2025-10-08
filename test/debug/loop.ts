import { Foundry } from '@adraffy/blocksmith';
import { EthProver } from "../../src/eth/EthProver.js";
import { GatewayProgram, GatewayRequest } from "../../src/vm.js";

const foundry = await Foundry.launch();
const prover = await EthProver.latest(foundry.provider);

const req = new GatewayRequest(1);

// This creates a program that pushes the output at index 0 to the stack and evaluates it
req.pushProgram(new GatewayProgram().pushOutput(0).eval());
// That program is then set as the output at index 0
req.setOutput(0);
// This pushes the output at index 0 (the program) to the stack
req.pushOutput(0);
// And then evaluates it
req.eval();

// I.E. This is a recursive loop that will blow up when maxDepth is exceeded

try {
	await prover.evalRequest(req);
} catch (err) {
	console.log(err);
}

await foundry.shutdown();
