import { OPRollup } from "../../src/op/OPRollup.js";
import { createProviderPair } from "../providers.js";

const config = OPRollup.baseMainnetConfig;
const rollup = new OPRollup(createProviderPair(config), config);

const commit = await logTime('fetchLatestCommit', rollup.fetchLatestCommit());
await logTime('fetchParentCommit', rollup.fetchParentCommit(commit));

await logTime('prove(cold)', commit.prover.prove([[config.L2OutputOracle, true]]));

commit.prover.proofLRU.clear();

await logTime('getStorage(cold)', commit.prover.getStorage(config.L2OutputOracle, 0n));
await logTime('getProofs(warm)', commit.prover.getProofs(config.L2OutputOracle, [1n]));
await logTime('getStorage(hot)', commit.prover.getStorage(config.L2OutputOracle, 0n));

await logTime('prove(hot)', commit.prover.prove([
	[config.L2OutputOracle, true],
	[config.L2OutputOracle, 1n]
]));

async function logTime<T>(label: string, promise: Promise<T>): Promise<T> {
	const t = performance.now();
	const ret = await promise;
	console.log((performance.now() - t).toFixed().padStart(5), label);
	return ret;
}