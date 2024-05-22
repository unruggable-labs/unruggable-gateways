import type {Proof, Provider, Resolvable} from './types.js';
import type {BytesLike, BigNumberish, Block/*ParamType*/} from 'ethers';
import {Interface/*, AbiCoder*/} from 'ethers/abi';
import {hexlify, toBeHex, toUtf8Bytes, getBytes, concat, dataSlice} from 'ethers/utils';
import {solidityPackedKeccak256} from 'ethers/hash';
import {keccak256} from 'ethers/crypto';
import {ZeroAddress} from 'ethers/constants';
import {SmartCache} from './SmartCache.js';

type RPCEthGetProof = {
	accountProof: Proof;
	storageProof: {proof: Proof}[];
};

const MAX_OUTPUTS = 255;
const MAX_INPUTS = 255;
//const MAX_STACK = 32;

const OP_TARGET			= 1;
const OP_TARGET_FIRST	= 2;

const OP_COLLECT		= 5;
const OP_COLLECT_FIRST  = 6;
const OP_COLLECT_RANGE	= 7;

const OP_PUSH			= 10;
const OP_PUSH_OUTPUT	= 11;
const OP_PUSH_SLOT		= 12;
const OP_PUSH_TARGET	= 13;

const OP_SLOT_ADD		= 20;
const OP_SLOT_FOLLOW	= 21;
const OP_SLOT_SET		= 22;

const OP_STACK_KECCAK	= 30;
const OP_STACK_CONCAT   = 31;
const OP_STACK_SLICE	= 32;
const OP_STACK_FIRST	= 33;

export const GATEWAY_ABI = new Interface([
	// v1
	`function getStorageSlots(address addr, bytes32[] memory commands, bytes[] memory constants) external pure returns(bytes memory witness)`,
	// v2
	`function fetch(bytes context, tuple(bytes ops, bytes[] inputs) request) returns (bytes memory)`
]);

function uint256FromHex(hex: string) {
	// the following should be equivalent to EVMProofHelper._toUint256()
	return hex === '0x' ? 0n : BigInt(hex.slice(0, 66));
}
function addressFromHex(hex: string) {
	// the following should be equivalent to: address(uint160(_toUint256(x)))
	return '0x' + (hex.length >= 66 ? hex.slice(26, 66) : hex.slice(2).padStart(40, '0').slice(-40)).toLowerCase();
}
function isNonzeroHex(hex: string) {
	return !/^0x0*$/.test(hex);
}

export class EVMRequestV1 {
	target: string;
	readonly commands: string[];
	readonly constants: string[];
	private readonly buf: number[];
	constructor(target = ZeroAddress, commands: string[] = [], constants: string[] = []) {
		this.target = target;
		this.commands = commands;
		this.constants = constants;
		this.buf = [];
	}
	private addConst(x: BytesLike) {
		if (this.constants.length >= 32) throw new Error('constants overflow');
		this.constants.push(hexlify(x));
		return this.constants.length-1;
	}
	private start(flags: number, slot: BigNumberish) {
		this.end();
		this.buf.push(flags, this.addConst(toBeHex(slot, 32)));
		return this;
	}
	end() {
		let {buf} = this;
		if (!buf.length) return;
		if (buf.length < 32 && buf[buf.length-1] != 0xFF) buf.push(0xFF);
		let word = new Uint8Array(32);
		word.set(buf);
		this.commands.push(hexlify(word));
		buf.length = 0;
	}
	getStatic(slot: BigNumberish)  { return this.start(0, slot); }
	getDynamic(slot: BigNumberish) { return this.start(1, slot); }
	ref(i: number) {
		this.buf.push((1 << 5) | i);
		return this;
	}
	element(x: BigNumberish) { return this.elementBytes(toBeHex(x, 32)); }
	elementStr(s: string) { return this.elementBytes(toUtf8Bytes(s)); }
	elementBytes(x: BytesLike) {
		this.buf.push(this.addConst(x));
		return this;
	}
	encode() {
		this.end();
		return GATEWAY_ABI.encodeFunctionData('getStorageSlots', [this.target, this.commands, this.constants]);
	}
	v2() {
		this.end();
		let req = new EVMRequest();
		req.push(this.target);
		req.target();
		for (let cmd of this.commands) {
			try {
				let v = getBytes(cmd);
				req.setSlot(this.constants[v[1]]); // first op is initial slot offset
				for (let i = 2; i < v.length; i++) {
					let op = v[i];
					if (op === 0xFF) break;
					let operand = op & 0x1F;
					switch (op >> 5) {
						case 0: { // OP_CONSTANT
							req.pushBytes(this.constants[operand]).follow();
							continue;
						}
						case 1: { // OP_BACKREF
							req.pushOutput(operand).follow();
							continue;
						}
						default: throw new Error(`unknown op: ${op}`);
					}
				}
				req.collect(v[0] & 1);
			} catch (err) {
				Object.assign(err!, {cmd});
				throw err;
			}
		}
		return req;
	}
}

export class EVMRequest {
	static decode(data: BytesLike) {
		let [context, [ops, inputs]] = GATEWAY_ABI.decodeFunctionData('fetch', data);
		ops = getBytes(ops);
		let r = new this(ops, inputs, ops.length);
		r.context = context;
		return r;
	}
	private buf: Uint8Array;
	private pos: number;
	readonly inputs: string[];
	context?: string;
	constructor(buf = new Uint8Array(1024), inputs: string[] = [], pos: number = 1) {
		this.buf = buf;
		this.pos = pos;
		this.inputs = inputs;
	}
	encode(context?: string) {
		return GATEWAY_ABI.encodeFunctionData('fetch', [context ?? this.context ?? '0x', [this.ops, this.inputs]]);
	}
	get ops(): Uint8Array {
		return this.buf.slice(0, this.pos);
	}
	private addOp(op: number) {
		// if (Number.isSafeInteger(op) || op < 0) throw Object.assign(new Error('invalid op'), {op});
		// while (op > 127) {
		// 	this.buf[this.pos++] = (op & 127) | 128;
		// 	op >>= 7;
		// }
		// this.buf[this.pos++] = op;
		if ((op & 0xFF) !== op) throw Object.assign(new Error('expected uint8'), {op});
		if (this.pos >= this.buf.length) throw new Error('op overflow');
		this.buf[this.pos++] = op;
		return this;
	}
	// private addBigOp(arg: number) {
	// 	if ((arg & 0xFFFFFF) !== arg) throw Object.assign(new Error('expected uint24'), {arg});
	// 	if (this.pos + 3 >= this.buf.length) throw new Error('op overflow');
	// 	this.buf[this.pos++] = arg >> 16;
	// 	this.buf[this.pos++] = arg >> 8;
	// 	this.buf[this.pos++] = arg;
	// 	return this;
	// }
	private addInput(v: BytesLike) {
		if (this.inputs.length == MAX_INPUTS) throw new Error('inputs overflow');
		this.inputs.push(hexlify(v));
		return this.inputs.length-1;
	}
	private addOutput() {
		let oi = this.buf[0];
		if (oi == MAX_OUTPUTS) throw new Error('outputs overflow');
		this.buf[0] = oi + 1;
		return oi;
	}

	target() { return this.addOp(OP_TARGET); }
	firstTarget() { return this.addOp(OP_TARGET_FIRST); }
	setTarget(address: string) { return this.push(address).target(); }
	
	collect(step: number) { return this.addOp(OP_COLLECT).addOp(step).addOutput(); }
	getValue() { this.collect(0); return this; }
	getBytes() { this.collect(1); return this; }

	collectFirstNonzero(step: number) { return this.addOp(OP_COLLECT_FIRST).addOp(step).addOutput(); }
	firstNonzeroValue() { this.collectFirstNonzero(0); return this; }
	firstNonzeroBytes() { this.collectFirstNonzero(1); return this; }

	collectRange(len: number) { return this.addOp(OP_COLLECT_RANGE).addOp(len).addOutput(); } // bigOp
	getValues(len: number) { this.collectRange(len); return this; }

	//pushTyped(type: string | ParamType, value: any) { return this.pushBytes(AbiCoder.defaultAbiCoder().encode([type], [value])); }
	push(x: BigNumberish) { return this.pushBytes(toBeHex(x, 32)); }
	pushStr(s: string) { return this.pushBytes(toUtf8Bytes(s)); }
	pushBytes(x: BytesLike) { return this.addOp(OP_PUSH).addOp(this.addInput(x)); }
	pushOutput(oi: number) { return this.addOp(OP_PUSH_OUTPUT).addOp(oi); }

	pushTargetRegister() { return this.addOp(OP_PUSH_TARGET); }
	pushSlotRegister() { return this.addOp(OP_PUSH_SLOT); }

	add() { return this.addOp(OP_SLOT_ADD); }
	set() { return this.addOp(OP_SLOT_SET); }
	setSlot(slot: BigNumberish) { return this.push(slot).set(); }
	addSlot(slot: BigNumberish) { return this.push(slot).add(); }

	follow() { return this.addOp(OP_SLOT_FOLLOW); }
	element(slot: BigNumberish) { return this.push(slot).follow(); }
	elementStr(s: string) { return this.pushStr(s).follow(); }
	elementBytes(x: BytesLike) { return this.pushBytes(x).follow(); }
	elementOutput(oi: number) { return this.pushOutput(oi).follow(); }

	concat(n: number) { return this.addOp(OP_STACK_CONCAT).addOp(n); }
	keccak() { return this.addOp(OP_STACK_KECCAK); }
	replaceWithFirstNonzero() { return this.addOp(OP_STACK_FIRST); }
	
	slice(pos: number, len: number) { return this.addOp(OP_STACK_SLICE).addOp(pos).addOp(len); } // bigOp
}

type OutputHeader = {
	target: string;
	slots: bigint[];
};
export type Output = OutputHeader & {
	size?: number;
	parent?: EVMProver;
	hidden?: boolean;
	value(): Promise<string>;
};
export type ResolvedOutput = OutputHeader & {value: string};

export class EVMProver {
	static async latest(provider: Provider) {
		let block = await provider.getBlockNumber();
		return new this(provider, toBeHex(block));
	}
	static async resolved(outputs: Output[]): Promise<ResolvedOutput[]> {
		// fully resolve and unwrap the values
		return Promise.all(outputs.filter(x => !x.hidden).map(async x => {
			return {...x, value: await x.value()};
		}));
	}
	static async executed(provider: Provider, req: EVMRequest) {
		// get resolved outputs from request at latest block of provider
		let p = await this.latest(provider);
		return p.execute(req);
	}
	readonly provider: Provider;
	readonly block: string;
	readonly maxBytes: number = 1 << 13; // 8KB;
	private cache: SmartCache;
	constructor(provider: Provider, block: string, cache?: SmartCache) {
		this.provider = provider;
		this.block = block;
		this.cache = cache ?? new SmartCache();
	}
	async getBlock(): Promise<Block> {
		return this.cache.get('BLOCK', () => this.provider.getBlock(this.block));
	}
	async getExists(target: string): Promise<boolean> {
		// assuming this is cheaper than eth_getProof with 0 slots
		// why isn't there eth_getCodehash?
		return this.cache.get(target, t => this.provider.getCode(t, this.block).then(x => x.length > 2));
	}
	async getStorage(target: string, slot: BigNumberish): Promise<string> {
		// note: target should be lowercase
		slot = toBeHex(slot); // canonicalize slot since RPC is picky
		return this.cache.get(`${target}:${slot}`, async () => {
			let value = await this.provider.getStorage(target, slot, this.block);
			if (isNonzeroHex(value)) { // => code exists => is contract => non-null storage trie
				this.cache.add(target, true);
			}
			return value;
		});
	}
	async prove(outputs: Output[]): Promise<[accountProofs: Proof[], stateProofs: [accountIndex: number, storageProofs: Proof[]][]]> {
		// deduplicate accounts: [account, slot[]][] into {account => Set<slots>}
		type Bucket = Map<bigint, string[][] | null> & {index: number, proof: Proof};
		let targets = new Map<string, Bucket>();
		let buckets = outputs.map(output => {
			let bucket = targets.get(output.target);
			if (!bucket) {
				bucket = new Map() as Bucket;
				bucket.index = targets.size;
				targets.set(output.target, bucket);
			}
			output.slots.forEach(slot => bucket.set(slot, null)); // placeholder
			return bucket;
		});
		// prove all slots for a specific account in one RPC
		// TODO: check eth_getProof limits
		// https://github.com/ethereum/go-ethereum/blob/9f96e07c1cf87fdd4d044f95de9c1b5e0b85b47f/internal/ethapi/api.go#L707 
		// 20240501: no limit, just response size
		await Promise.all(Array.from(targets, async ([target, bucket]) => {
			let slots = [...bucket.keys()]; // order doesn't matter
			let proof = await this.provider.send('eth_getProof', [target, slots.map(x => toBeHex(x, 32)), this.block]) as RPCEthGetProof;
			bucket.proof = proof.accountProof;
			slots.forEach((slot, i) => bucket.set(slot, proof.storageProof[i].proof)); // replace placeholder
		}));
		// note: duplicate [account, slot]-pairs not not deduplicated but unlikely in practice
		return [
			// ordered account proofs
			Array.from(targets.values(), x => x.proof),
			// ordered storage proofs, where index into account proofs
			outputs.map((output, i) => {
				let bucket = buckets[i];
				return [bucket.index, output.slots.map(x => bucket.get(x) as Proof)]; // ordered storage proofs per account
			})
		];
	}
	async execute(req: EVMRequest) {
		return EVMProver.resolved(await this.eval(req.ops, req.inputs));
	}
	async eval(ops: Uint8Array, inputs: string[]) {
		let pos = 1; // skip # outputs
		let slot = 0n;
		let target: string = ZeroAddress;
		let outputs: Resolvable<Output>[] = [];
		let stack: Resolvable<string>[] = [];
		const readByte = () => {
			let op = ops[pos++];
			if (pos > ops.length) throw new Error('op overflow');
			return op;
		};
		const popStack = () => {
			if (!stack.length) throw new Error('stack underflow');
			return stack.pop()!;
		};
		outer: while (pos < ops.length) {
			let op = readByte();
			try {
				switch (op) {
					case OP_TARGET: {
						target = addressFromHex(await popStack());
						slot = 0n;
						break;
					}
					case OP_TARGET_FIRST: {
						let exists;
						while (stack.length && !exists) {
							target = addressFromHex(await popStack());
							outputs.push({
								target,
								slots: [],
								hidden: true,
								async value() { return ''; }
							});
							exists = await this.getExists(target);
						}
						if (!exists) break outer;
						stack.length = 0;
						slot = 0n;
						break;
					}
					case OP_COLLECT: {
						outputs.push(this.createOutput(target, slot, readByte()));
						slot = 0n;
						break;
					}
					case OP_COLLECT_RANGE: {
						let n = readByte();
						let output = {
							parent: this,
							target,
							size: n << 5,
							slots: Array.from({length: n}, (_, i) => slot + BigInt(i)),
							value() {
								let p = Promise.all(this.slots.map(x => this.parent.getStorage(this.target, x))).then(concat);
								this.value = () => p;
								return p;
							}
						};
						outputs.push(output);
						slot = 0n;
						break;
					}
					case OP_COLLECT_FIRST: {
						let step = readByte();
						while (stack.length) { // TODO: make this parallel or batched?
							let output = await this.createOutput(target, uint256FromHex(await popStack()), step);
							outputs.push(output);
							if (output.size && isNonzeroHex(await output.value())) break;
							output.hidden = stack.length > 0;
						}
						stack.length = 0;
						slot = 0n;
						break;
					}
					case OP_PUSH: { 
						stack.push(inputs[readByte()]);
						break;
					}
					case OP_PUSH_OUTPUT: {
						stack.push(Promise.resolve(outputs[readByte()]).then(x => x.value()));
						break;
					}
					case OP_PUSH_SLOT: {
						stack.push(toBeHex(slot, 32));
						// TODO: should this reset slot?
						break;
					}
					case OP_PUSH_TARGET: {
						stack.push(target);
						break;
					}
					case OP_SLOT_ADD: {
						slot += uint256FromHex(await popStack());
						break;
					}
					case OP_SLOT_SET: {
						slot = uint256FromHex(await popStack());
						break;
					}
					case OP_SLOT_FOLLOW: {
						slot = BigInt(keccak256(concat([await popStack(), toBeHex(slot, 32)])));
						break;
					}
					case OP_STACK_KECCAK: {
						stack.push(keccak256(await popStack()));
						break;
					}
					case OP_STACK_CONCAT: {
						let n = readByte();
						stack.splice(Math.max(0, stack.length-n), n, n ? concat(await Promise.all(stack.slice(-n))) : '0x');
						break;
					}
					case OP_STACK_SLICE: {
						let x = readByte();
						let n = readByte();
						stack.push(dataSlice(await popStack(), x, x + n));
						break;
					}
					case OP_STACK_FIRST: {
						let first = '0x';
						while (stack.length) {
							let value = await popStack();
							if (isNonzeroHex(value)) {
								first = value;
								break;
							}
						}
						stack.length = 0;
						stack.push(first);
						break;
					}
					default: throw new Error('unknown op');
				}
			} catch (err) {
				Object.assign(err!, {ops, inputs, state: {op, pos, target, slot, stack}});
				throw err;
			}
		}
		return Promise.all(outputs);
	}
	async createOutput(target: string, slot: bigint, step: number): Promise<Output> {
		//console.log({target, slot, step});
		let first = await this.getStorage(target, slot);
		let size = parseInt(first.slice(64), 16); // last byte
		if (step == 0) { // bytes32
			let p = Promise.resolve(first);
			return {
				target,
				size: size ? 32 : 0, // size is falsy on zero 
				slots: [slot],
				value: () => p
			};
		} else if (step == 1 && !(size & 1)) { // small bytes
			size >>= 1;
			let p = Promise.resolve(dataSlice(first, 0, size));
			return {
				target,
				size,
				slots: [slot],
				value: () => p
			};
		}
		let big = (BigInt(first) >> 1n) * BigInt(step); // this could be done with Number()
		if (big > this.maxBytes) throw Object.assign(new Error('dynamic overflow'), {size: big, max: this.maxBytes});
		size = Number(big);
		let offset = BigInt(solidityPackedKeccak256(['uint256'], [slot]));
		let slots = [slot, ...Array.from({length: (size + 31) >> 5}, (_, i) => offset + BigInt(i))];
		let output = {
			parent: this,
			target,
			slots,
			size,
			value() {
				let p = Promise.all(this.slots.slice(1).map(x => this.parent.getStorage(this.target, x))).then(v => {
					return dataSlice(concat(v), 0, this.size);
				});
				this.value = () => p;
				return p;
			}
		};
		return output;
	}
}
