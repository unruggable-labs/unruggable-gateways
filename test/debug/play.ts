import { randomBytes, SigningKey, ZeroHash } from 'ethers';
import { GatewayRequestV1, GatewayRequest, EthProver, CHAINS,  NitroRollup, OPRollup, TaikoRollup, ZKSyncRollup, fetchBlockNumber, TrustedRollup, ZKEVMProver, ZKSyncProver, LineaProver, OPFaultRollup } from '../../src/index.js';
import { createProvider, createProviderPair } from '../providers.js';

// this is just a worksheet

//console.log(createProvider(1n)._getConnection())

if (1) {
	const config = { ...OPRollup.blastMainnnetConfig, minAgeSec: 3600 }
	const rollup = new OPRollup(createProviderPair(config), config);
	console.log("latestCommitIndex1", await rollup.fetchLatestCommitIndex());
	rollup.latestBlockTag = await fetchBlockNumber(rollup.provider1) - 20000n;
	console.log("-------------");
	console.log("latestCommitIndex2", await rollup.fetchLatestCommitIndex());
	throw 1;
}

process.exit();

if (1) {
	const config = TaikoRollup.mainnetConfig;
	const rollup = await TaikoRollup.create(createProviderPair(config), config);
	console.log(await rollup.fetchLatestCommitIndex());
	rollup.latestBlockTag = await fetchBlockNumber(rollup.provider1) - 200n;
	console.log(await rollup.fetchLatestCommitIndex());
	console.log(rollup.defaultWindow);
	throw 1;
}

if (1) {
	const provider = createProvider(CHAINS.MAINNET);
	const key = new SigningKey(randomBytes(32));
	const rollup1 = new TrustedRollup(provider, EthProver, key);
	const rollup2 = new TrustedRollup(provider, ZKSyncProver, key);
	const rollup3 = new TrustedRollup(provider, LineaProver, key);
	const rollup4 = new TrustedRollup(provider, ZKEVMProver, key);
	throw 1;
}

if (1) {
	const provider = createProvider(CHAINS.OP_SEPOLIA);
	console.log(await fetchBlockNumber(provider, 'finalized'));
	console.log(await fetchBlockNumber(provider, -5));
	console.log(await fetchBlockNumber(provider, 'latest'));
	throw 1;
}

if (0) {
	const prover = await EthProver.latest(createProvider(CHAINS.MAINNET));
	console.log(prover);
	//console.log(await prover.supportsInterface('0x84c5AdB77dd9f362A1a3480009992d8d47325dc3', '0x73302a25'));
	throw 1;
}

if (0) {
	const config = ZKSyncRollup.mainnetConfig;
	const rollup = new ZKSyncRollup(createProviderPair(config), config);
	//const commit = await rollup.fetchLatestCommit();
	const commit = await rollup.fetchLatestCommit();
	console.log(commit);
	throw 1;
}


if (0) {
	const config = OPFaultRollup.baseMainnetConfig;
	const rollup = new OPFaultRollup(createProviderPair(config), config);
	//const commit = await rollup.fetchLatestCommit();
	const commit = await rollup.fetchCommit(0n);
	console.log(commit);
	throw 1;
}

if (0) {
	const config = NitroRollup.arb1MainnetConfig;
	const rollup = new NitroRollup(createProviderPair(config), config);
	const commit = await rollup.fetchLatestCommit();
	console.log(commit);
	throw 1;
}

if (0) {
	const config = TaikoRollup.mainnetConfig;
	const rollup = await TaikoRollup.create(createProviderPair(config), config);
	const commit = await rollup.fetchCommit(123124124n);
	console.log(await commit.prover.prove([{target: config.TaikoL1, required: true}]));
	throw 1;
}

if (1) {
	const config = ZKSyncRollup.mainnetConfig;
	const rollup = new ZKSyncRollup(createProviderPair(config), config);
	const commit = await rollup.fetchLatestCommit();
	console.log(await commit.prover.prove([{target: config.DiamondProxy, required: true}]));
	throw 1;
}

//let foundry = await Foundry.launch({infoLog: false});

const prover = await EthProver.latest(createProvider(CHAINS.MAINNET));

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

// #0: mapping (bytes32 => Record) records; => struct Record { address owner; address resolver;	uint64 ttl; }
// #1: mapping (address => mapping(address => bool)) operators;
// #2: ENS _old

{
  const r = new GatewayRequest(1);
  r.push(ENS_REGISTRY).target();
  r.push(0).follow().read().setOutput(0); // owner of root: 0xaB528d626EC275E3faD363fF1393A41F581c5897
  const vm = await prover.evalRequest(r);
  console.log(await vm.resolveOutputs());
}

//console.log(await prover.execute(new GatewayRequest(0).setTarget(ENS_REGISTRY).element(0).getValue()));

//console.log(await prover.execute(new GatewayRequest().setTarget('0xE68d1aEeE2C17E43A955103DaB5E341eE439f55c').getValues(10)));

prover.provider.destroy();
//await foundry.shutdown();

const A = ENS_REGISTRY;
const r1 = new GatewayRequestV1(A).getStatic(3).getStatic(4).ref(0);
const r2 = new GatewayRequest()
  .setTarget(A)
  .setSlot(3)
  .read()
  .addOutput()
  .setSlot(4)
  .pushOutput(0)
  .follow()
  .read()
  .addOutput();

console.log(r1.v2());
console.log(r2);
