import type {BytesLike, BigNumberish, Proof, Provider, Resolvable} from './types.js';
import {ethers} from 'ethers';
import {SmartCache} from './SmartCache.js';

const MAX_OUTPUTS = 255;
const MAX_INPUTS = 255;

const OP_TARGET			= 1;
const OP_TARGET_FIRST	= 2;

const OP_COLLECT		= 5;
const OP_COLLECT_FIRST  = 6;

const OP_PUSH			= 10;
const OP_PUSH_OUTPUT	= 11;
const OP_PUSH_SLOT		= 12;

const OP_SLOT_ADD		= 20;
const OP_SLOT_FOLLOW	= 21;
const OP_SLOT_SET		= 22;

const OP_STACK_KECCAK	= 30;
const OP_STACK_CONCAT   = 31;
const OP_STACK_SLICE	= 32;
const OP_STACK_FIRST	= 33;

export const GATEWAY_ABI = new ethers.Interface([
	`function fetch(bytes context, tuple(bytes, bytes[]) request) returns (bytes memory)`
]);

function uint256_from_bytes(hex: string) {
	// the following should be equivalent to EVMProofHelper._toUint256()
	return hex === '0x' ? 0n : BigInt(hex.slice(0, 66));
}
function address_from_bytes(hex: string) {
	// the following should be equivalent to: address(uint160(_toUint256(x)))
	return '0x' + (hex.length >= 66 ? hex.slice(26, 66) : hex.slice(2).padStart(40, '0').slice(-40)).toLowerCase();
}

export class EVMRequest {
	static create(n = 1024) {
		return new this(new Uint8Array(n));
	} 
	static from_v1(target: string, commands: string[], constants: string[]) {
		let req = this.create();
		req.push(target);
		req.target();
		for (let cmd of commands) {
			try {
				let v = ethers.getBytes(cmd);
				req.push(constants[v[1]]); // first op is initial slot offset
				req.add();
				for (let i = 2; i < v.length; i++) {
					let op = v[i];
					if (op === 0xFF) break;
					let operand = op & 0x1F;
					switch (op >> 5) {
						case 0: { // OP_CONSTANT
							req.push_bytes(constants[operand]);
							req.follow();
							continue;
						}
						case 1: { // OP_BACKREF
							req.push_output(operand);
							req.follow();
							continue;
						}
						default: throw new Error(`unknown op: ${op}`);
					}
				}
				req.collect(v[0] & 1);
			} catch (err) {
				Object.assign(err!, {cmd});
			}
		}
		return req;
	}
	static decode(data: BytesLike) {
		let [context, [ops, inputs]] = GATEWAY_ABI.decodeFunctionData('fetch', data);
		ops = ethers.getBytes(ops);
		let r = new this(ops, inputs, ops.length);
		r.context = context;
		return r;
	}
	private buf: Uint8Array;
	private pos: number;
	readonly inputs: string[];
	public context?: string;
	constructor(buf: Uint8Array, inputs: string[] = [], pos: number = 1) {
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
	private add_op(op: number) {
		if ((op & 255) !== op) throw Object.assign(new Error('expected byte'), {op});
		let i = this.pos;
		if (i === this.buf.length) throw new Error('op overflow');
		this.buf[i] = op;
		this.pos = i + 1;
	}
	private add_input(v: BytesLike) {
		if (this.inputs.length == MAX_INPUTS) throw new Error('inputs overflow');
		this.inputs.push(ethers.hexlify(v));
		return this.inputs.length-1;
	}
	private add_output() {
		let oi = this.buf[0];
		if (oi == MAX_OUTPUTS) throw new Error('outputs overflow');
		this.buf[0] = oi + 1;
		return oi;
	}
	target() { this.add_op(OP_TARGET); }
	target_first() { this.add_op(OP_TARGET_FIRST); }
	collect(step: number) {
		this.add_op(OP_COLLECT);
		this.add_op(step);
		return this.add_output();
	}
	collect_first(step: number) {
		this.add_op(OP_COLLECT_FIRST);
		this.add_op(step);
		return this.add_output();
	}
	//push_abi(type, x) { return this.push_bytes(ethers.AbiCoder.defaultAbiCoder().encode([type], [x])); }
	push(x: BigNumberish) { this.push_bytes(ethers.toBeHex(x, 32)); }
	push_str(x: string) { this.push_bytes(ethers.toUtf8Bytes(x)); }
	push_bytes(x: BytesLike) {
		this.add_op(OP_PUSH);
		this.add_op(this.add_input(x));
	}
	push_slot() { this.add_op(OP_PUSH_SLOT); }
	push_output(oi: number) {
		this.add_op(OP_PUSH_OUTPUT);
		this.add_op(oi);
	}
	slice(x: number, n: number) {
		this.add_op(OP_STACK_SLICE);
		this.add_op(x);
		this.add_op(n);
	}
	concat(n: number) { 
		this.add_op(OP_STACK_CONCAT); 
		this.add_op(n);
	}
	follow() { this.add_op(OP_SLOT_FOLLOW); }
	add()    { this.add_op(OP_SLOT_ADD); }
	set()    { this.add_op(OP_SLOT_SET); }
	keccak() { this.add_op(OP_STACK_KECCAK); }
	first()  { this.add_op(OP_STACK_FIRST); }
}

type OutputHeader = {
	target: string;
	slots: bigint[];
};
export type Output = OutputHeader & {
	size?: number;
	parent?: EVMProver;
	value(): Promise<string>;
};
export type ResolvedOutput = OutputHeader & {value: string};



export class EVMProver {
	static async latest(provider: Provider) {
		let block = await provider.getBlockNumber();
		return new this(provider, ethers.toBeHex(block));
	}
	static async resolved(outputs: Output[]): Promise<ResolvedOutput[]> {
		// fully resolve and unwrap the values
		return Promise.all(outputs.map(async x => {
			return {...x, value: await x.value()};
		}));
	}
	readonly provider: Provider;
	readonly block: string;
	readonly max_bytes: number = 1 << 13; // 8KB;
	private cache: SmartCache;
	constructor(provider: Provider, block: string, cache?: SmartCache) {
		this.provider = provider;
		this.block = block;
		this.cache = cache ?? new SmartCache();
	}
	async getExists(target: string): Promise<boolean> {
		// assuming this is cheaper than eth_getProof with 0 slots
		// why isn't there eth_getCodehash?
		return this.cache.get(target, t => this.provider.getCode(t, this.block).then(x => x.length > 2));
	}
	async getStorage(target: string, slot: BigNumberish): Promise<string> {
		slot = ethers.toBeHex(slot);
		return this.cache.get(`${target}:${slot}`, async () => {
			let value = await this.provider.getStorage(target, slot, this.block)
			if (value !== ethers.ZeroHash) {
				// any nonzero slot => code exists => contract => non-null storage trie
				this.cache.add(target, true);
			}
			return value;
		});
	}
	async prove(outputs: Output[]): Promise<[accountProofs: Proof, stateProofs: [accountIndex: number, storageProof: Proof[]][]]> {
		type Bucket = Map<bigint, string[][] | null> & {index: number, proof: string[]};
		let targets = new Map<string, Bucket>();
		let buckets = outputs.map(output => {
			let bucket = targets.get(output.target);
			if (!bucket) {
				bucket = new Map() as Bucket;
				bucket.index = targets.size;
				targets.set(output.target, bucket);
			}
			output.slots.forEach(x => bucket.set(x, null));
			return bucket;
		});
		// TODO: check eth_getProof limits
		// https://github.com/ethereum/go-ethereum/blob/9f96e07c1cf87fdd4d044f95de9c1b5e0b85b47f/internal/ethapi/api.go#L707 
		// 20240501: no limit, just response size
		await Promise.all(Array.from(targets, async ([target, bucket]) => {
			let slots = [...bucket.keys()];
			let proof = await this.provider.send('eth_getProof', [target, slots.map(x => ethers.toBeHex(x, 32)), this.block]);
			bucket.proof = proof.accountProof;
			slots.forEach((key, i) => bucket.set(key, proof.storageProof[i].proof));
		}));
		return [
			Array.from(targets.values(), x => x.proof),
			outputs.map((output, i) => {
				let bucket = buckets[i];
				return [bucket.index, output.slots.map(x => bucket.get(x) as Proof)];
			})
		];
	}
	async execute(req: EVMRequest) {
		return EVMProver.resolved(await this.eval(req.ops, req.inputs));
	}
	async eval(ops: Uint8Array, inputs: string[]) {
		console.log({ops, inputs});
		let pos = 1; // skip # outputs
		let slot = 0n;
		let target: string = '0x';
		let outputs: Resolvable<Output>[] = [];
		let stack: Resolvable<string>[] = [];
		const read_byte = () => {
			let op = ops[pos++];
			if (pos > ops.length) throw new Error('op overflow');
			return op;
		};
		const pop_stack = () => {
			if (!stack.length) throw new Error('stack underflow');
			return stack.pop()!;
		};
		//const expected = read_byte();
		outer: while (pos < ops.length) {
			let op = read_byte();
			try {
				switch (op) {
					case OP_TARGET: {
						target = address_from_bytes(await pop_stack());
						slot = 0n;
						break;
					}
					case OP_TARGET_FIRST: {
						let exists;
						while (stack.length && !exists) {
							target = address_from_bytes(await pop_stack());
							outputs.push({
								target, 
								slots: [], 
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
						outputs.push(this.createOutput(target, slot, read_byte()));
						slot = 0n;
						break;
					}
					case OP_COLLECT_FIRST: {
						let step = read_byte();
						while (stack.length) { // TODO: make this parallel or batched?
							let output = await this.createOutput(target, uint256_from_bytes(await pop_stack()), step);
							outputs.push(output);
							if (step == 0 ? uint256_from_bytes(await output.value()) : output.size) break;
						}
						stack.length = 0;
						slot = 0n;
						break;
					}
					case OP_PUSH: { 
						stack.push(inputs[read_byte()]);
						break;
					}
					case OP_PUSH_OUTPUT: {
						stack.push(Promise.resolve(outputs[read_byte()]).then(x => x.value()));
						break;
					}
					case OP_PUSH_SLOT: {
						stack.push(ethers.toBeHex(slot, 32));
						break;
					}
					case OP_SLOT_ADD: {
						slot += uint256_from_bytes(await pop_stack());
						break;
					}
					case OP_SLOT_SET: {
						slot = uint256_from_bytes(await pop_stack());
						break;
					}
					case OP_SLOT_FOLLOW: {
						slot = BigInt(ethers.keccak256(ethers.concat([await pop_stack(), ethers.toBeHex(slot, 32)])));
						break;
					}
					case OP_STACK_KECCAK: {
						stack.push(ethers.keccak256(await pop_stack()));
						break;
					}
					case OP_STACK_CONCAT: {
						let n = read_byte();
						stack.splice(Math.max(0, stack.length-n), n, n ? ethers.concat(await Promise.all(stack.slice(-n))) : '0x');
						break;
					}
					case OP_STACK_SLICE: {
						let x = read_byte();
						let n = read_byte();
						stack.push(ethers.dataSlice(await pop_stack(), x, x + n));
						break;
					}
					case OP_STACK_FIRST: {
						let first = '0x';
						while (stack.length) {
							let v = await pop_stack();
							if (!/^0x0*$/.test(v)) {
								first = v;
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
				size: size > 0 ? 32 : 0, // size is falsy on zero 
				slots: [slot],
				value: () => p
			};
		} else if (step == 1 && !(size & 1)) { // small bytes
			size >>= 1;
			let p = Promise.resolve(ethers.dataSlice(first, 0, size));
			return {
				target,
				size,
				slots: [slot],
				value: () => p
			};
		}
		let big = (BigInt(first) >> 1n) * BigInt(step); // this could be done with Number()
		if (big > this.max_bytes) throw Object.assign(new Error('dynamic overflow'), {size: big, max: this.max_bytes});
		size = Number(big);
		let offset = BigInt(ethers.solidityPackedKeccak256(['uint256'], [slot]));
		let slots = [slot, ...Array.from({length: (size + 31) >> 5}, (_, i) => offset + BigInt(i))];
		let output = {
			parent: this,
			target,
			slots,
			size,
			value() {
				let p = Promise.all(this.slots.slice(1).map(x => this.parent.getStorage(this.target, x))).then(v => {
					return ethers.dataSlice(ethers.concat(v), 0, size);
				});
				this.value = () => p;
				return p;
			}
		};
		return output;
	}
}
