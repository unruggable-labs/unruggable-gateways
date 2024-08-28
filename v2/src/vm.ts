import {
  bytesToHex,
  concatHex,
  decodeAbiParameters,
  encodeAbiParameters,
  encodePacked,
  hexToBytes,
  hexToString,
  keccak256,
  sliceHex,
  stringToHex,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import type { CachedMap } from './cached.js';
import type { EncodedProof, HexAddress, HexString } from './types.js';
import { unwrap, Wrapped, type Unwrappable } from './wrap.js';

// all addresses are lowercase
// all values are hex-strings

type HexFuture = Unwrappable<HexString>;

// maximum number of items on stack
// the following should be equivalent to EVMProtocol.sol
export const MAX_STACK = 64;

// OP_EVAL flags
// the following should be equivalent to EVMProtocol.sol
const STOP_ON_SUCCESS = 1;
const STOP_ON_FAILURE = 2;
const ACQUIRE_STATE = 4;

// program ops
// specific ids just need to be unique
// the following should be equivalent to EVMProtocol.sol
const OP_DEBUG = 255; // experimental
const OP_TARGET = 1;
const OP_SET_OUTPUT = 2;
const OP_EVAL_LOOP = 3;
const OP_EVAL_INLINE = 4;

const OP_REQ_NONZERO = 10;
const OP_REQ_CONTRACT = 11;

const OP_READ_SLOTS = 20;
const OP_READ_BYTES = 21;
const OP_READ_ARRAY = 22;

const OP_SLOT_ZERO = 30;
const OP_SLOT_ADD = 31;
const OP_SLOT_FOLLOW = 32;

const OP_PUSH_INPUT = 40;
const OP_PUSH_OUTPUT = 41;
const OP_PUSH_SLOT = 42;
const OP_PUSH_TARGET = 43;

const OP_DUP = 50;
const OP_POP = 51;

const OP_KECCAK = 60;
const OP_CONCAT = 61;
const OP_SLICE = 62;

function addressFromHex(hex: HexString): Address {
  // the following should be equivalent to: address(uint160(ProofUtils.uint256FromBytes(hex)))
  return ('0x' +
    (hex.length >= 66
      ? hex.slice(26, 66)
      : hex.slice(2).padStart(40, '0').slice(-40)
    ).toLowerCase()) as Address;
}
function bigintRange(start: bigint, length: number) {
  return Array.from({ length }, (_, i) => start + BigInt(i));
}
function solidityArraySlots(slot: bigint, length: number) {
  return length
    ? bigintRange(BigInt(keccak256(encodePacked(['uint256'], [slot]))), length)
    : [];
}
export function solidityFollowSlot(slot: bigint | number, key: Hex) {
  // https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#mappings-and-dynamic-arrays
  return BigInt(keccak256(concatHex([key, toHex(slot, { size: 32 })])));
}

type ProgramAction = {
  pos: number;
  op: number;
  name: string;
  [arg: string]: any;
};

// read an ops buffer
export class ProgramReader {
  static fromProgram(program: EVMProgram) {
    return new this(Uint8Array.from(program.ops), program.inputs.slice());
  }
  static fromEncoded(hex: HexString) {
    const [ops, inputs] = decodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }],
      hex
    );
    return new this(hexToBytes(ops), [...inputs]);
  }
  pos: number = 0;
  constructor(
    readonly ops: Uint8Array,
    readonly inputs: readonly HexString[]
  ) {}
  get remaining() {
    return this.ops.length - this.pos;
  }
  checkRead(n: number) {
    if (this.pos + n > this.ops.length) throw new Error('reader overflow');
  }
  readByte() {
    this.checkRead(1);
    return this.ops[this.pos++];
  }
  readShort() {
    return (this.readByte() << 8) | this.readByte();
  }
  readBytes() {
    const n = this.readShort();
    this.checkRead(n);
    return bytesToHex(this.ops.subarray(this.pos, (this.pos += n)));
  }
  readInput() {
    const i = this.readByte();
    if (i >= this.inputs.length) throw new Error(`invalid input index: ${i}`);
    return this.inputs[i];
  }
  readInputStr() {
    return hexToString(this.readInput());
  }
  readAction(): ProgramAction {
    const { pos } = this;
    const op = this.readByte();
    switch (op) {
      case OP_DEBUG:
        return { pos, op, name: 'DEBUG', label: this.readInputStr() };
      case OP_TARGET:
        return { pos, op, name: 'TARGET' };
      case OP_SLOT_ADD:
        return { pos, op, name: 'SLOT_ADD' };
      case OP_SLOT_ZERO:
        return { pos, op, name: 'SLOT_ZERO' };
      case OP_SET_OUTPUT:
        return { pos, op, name: 'SET_OUTPUT', index: this.readByte() };
      case OP_PUSH_INPUT:
        return { pos, op, name: 'PUSH_INPUT', index: this.readByte() };
      case OP_PUSH_OUTPUT:
        return { pos, op, name: 'PUSH_OUTPUT', index: this.readByte() };
      case OP_PUSH_SLOT:
        return { pos, op, name: 'PUSH_SLOT' };
      case OP_PUSH_TARGET:
        return { pos, op, name: 'PUSH_TARGET' };
      case OP_DUP:
        return { pos, op, name: 'DUP', back: this.readByte() };
      case OP_POP:
        return { pos, op, name: 'POP' };
      case OP_READ_SLOTS:
        return { pos, op, name: 'READ_SLOTS', count: this.readByte() };
      case OP_READ_BYTES:
        return { pos, op, name: 'READ_BYTES' };
      case OP_READ_ARRAY:
        return { pos, op, name: 'READ_ARRAY' };
      case OP_REQ_CONTRACT:
        return { pos, op, name: 'REQ_CONTRACT' };
      case OP_REQ_NONZERO:
        return { pos, op, name: 'REQ_NONZERO' };
      case OP_EVAL_INLINE:
        return { pos, op, name: 'EVAL_INLINE' };
      case OP_EVAL_LOOP:
        return {
          pos,
          op,
          name: 'EVAL_LOOP',
          back: this.readByte(),
          flags: this.readByte(),
        };
      case OP_SLOT_FOLLOW:
        return { pos, op, name: 'SLOT_FOLLOW' };
      case OP_KECCAK:
        return { pos, op, name: 'KECCAK' };
      case OP_CONCAT:
        return { pos, op, name: 'CONCAT' };
      case OP_SLICE:
        return {
          pos,
          op,
          name: 'SLICE',
          offset: this.readShort(),
          length: this.readShort(),
        };
      default: {
        throw new Error(`unknown op: ${op}`);
      }
    }
  }
  readActions() {
    const actions: ProgramAction[] = [];
    while (this.remaining) {
      actions.push(this.readAction());
    }
    return actions;
  }
}

export class EVMProgram {
  constructor(
    private parent: EVMProgram | undefined = undefined,
    readonly ops: number[] = [],
    readonly inputs: HexString[] = []
  ) {}
  clone() {
    return new EVMProgram(this.parent, this.ops.slice(), this.inputs.slice());
  }
  protected addByte(x: number) {
    if ((x & 0xff) !== x) throw new Error(`expected byte: ${x}`);
    this.ops.push(x);
    return this;
  }
  protected addShort(x: number) {
    //return this.addByte(x >> 8).addByte(x & 0xFF);
    if ((x & 0xffff) !== x) throw new Error(`expected short: ${x}`);
    this.ops.push(x >> 8, x & 0xff);
    return this;
  }
  addInput(x: bigint | number) {
    return this.addInputBytes(toHex(x, { size: 32 }));
  }
  addInputStr(s: string) {
    return this.addInputBytes(stringToHex(s));
  }
  addInputBytes(v: HexString) {
    const i = this.inputs.length;
    this.inputs.push(v); // note: no check, but blows up at 256
    return i;
  }
  encode() {
    return encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }],
      [bytesToHex(Uint8Array.from(this.ops)), this.inputs]
    );
  }
  debug(label = '') {
    return this.addByte(OP_DEBUG).addByte(this.addInputStr(label));
  }

  read(n = 1) {
    return this.addByte(OP_READ_SLOTS).addByte(n);
  }
  readBytes() {
    return this.addByte(OP_READ_BYTES);
  }
  readArray(step: number) {
    return this.addByte(OP_READ_ARRAY).addShort(step);
  }

  target() {
    return this.addByte(OP_TARGET);
  }
  setOutput(i: number) {
    return this.addByte(OP_SET_OUTPUT).addByte(i);
  }
  eval() {
    return this.addByte(OP_EVAL_INLINE);
  }
  evalLoop(
    opts: {
      success?: boolean;
      failure?: boolean;
      acquire?: boolean;
      back?: number;
    } = {}
  ) {
    let flags = 0;
    if (opts.success) flags |= STOP_ON_SUCCESS;
    if (opts.failure) flags |= STOP_ON_FAILURE;
    if (opts.acquire) flags |= ACQUIRE_STATE;
    return this.addByte(OP_EVAL_LOOP)
      .addByte(opts.back ?? 255)
      .addByte(flags);
  }

  zeroSlot() {
    return this.addByte(OP_SLOT_ZERO);
  }
  addSlot() {
    return this.addByte(OP_SLOT_ADD);
  }
  follow() {
    return this.addByte(OP_SLOT_FOLLOW);
  }

  requireContract() {
    return this.addByte(OP_REQ_CONTRACT);
  }
  requireNonzero(back = 0) {
    return this.addByte(OP_REQ_NONZERO).addByte(back);
  }

  pop() {
    return this.addByte(OP_POP);
  }
  dup(back = 0) {
    return this.addByte(OP_DUP).addByte(back);
  }

  pushOutput(i: number) {
    return this.addByte(OP_PUSH_OUTPUT).addByte(i);
  }
  pushInput(i: number) {
    return this.addByte(OP_PUSH_INPUT).addByte(i);
  }
  push(x: bigint | number) {
    return this.addByte(OP_PUSH_INPUT).addByte(this.addInput(x));
  }
  pushStr(s: string) {
    return this.addByte(OP_PUSH_INPUT).addByte(this.addInputStr(s));
  }
  pushBytes(v: HexString) {
    return this.addByte(OP_PUSH_INPUT).addByte(this.addInputBytes(v));
  }
  pushProgram(program: EVMProgram) {
    return this.pushBytes(program.encode());
  }
  pushSlot() {
    return this.addByte(OP_PUSH_SLOT);
  }
  pushTarget() {
    return this.addByte(OP_PUSH_TARGET);
  }

  concat() {
    return this.addByte(OP_CONCAT);
  }
  keccak() {
    return this.addByte(OP_KECCAK);
  }
  slice(x: number, n: number) {
    return this.addByte(OP_SLICE).addShort(x).addShort(n);
  }

  // experimental syntax
  // alternative: pushCommand()
  begin() {
    return new EVMProgram(this);
  }
  end() {
    const p = this.parent;
    if (!p) throw new Error('no parent');
    this.parent = undefined;
    p.pushBytes(this.encode());
    return p;
  }

  // shorthands?
  offset(x: bigint | number) {
    return this.push(x).addSlot();
  }
  setTarget(x: HexString) {
    return this.pushBytes(x).target();
  }
  setSlot(x: bigint | number) {
    return this.zeroSlot().offset(x);
  }
}

// a request is just a command where the leading byte is the number of outputs
export class EVMRequest extends EVMProgram {
  context: HexString | undefined;
  constructor(outputCount = 0) {
    super(undefined);
    this.addByte(outputCount);
  }
  get outputCount() {
    return this.ops[0];
  }
  // convenience for writing JS-based requests
  // (this functionality is not available in solidity)
  addOutput() {
    const i = this.ops[0];
    if (i == 0xff) throw new Error('output overflow');
    this.ops[0] = i + 1;
    return this.setOutput(i);
  }
}

export type Need = [target: HexString, slot: bigint | boolean];

export type ProofSequence = {
  proofs: EncodedProof[];
  order: Uint8Array;
};

// tracks the state of an program evaluation
// registers: [slot, target, stack]
// outputs are shared across eval()
// needs records sequence of necessary proofs
export class MachineState {
  static create(outputCount: number) {
    return new this(Array(outputCount).fill('0x'));
  }
  target: Address = zeroAddress;
  slot = 0n;
  stack: HexFuture[] = [];
  exitCode = 0;
  constructor(
    readonly outputs: HexFuture[],
    readonly needs: Need[] = [],
    readonly targets = new Map<HexString, Need>()
  ) {}
  checkOutputIndex(i: number) {
    if (i >= this.outputs.length) throw new Error(`invalid output index: ${i}`);
    return i;
  }
  async resolveOutputs() {
    return Promise.all(this.outputs.map(unwrap));
  }
  push(value: HexFuture) {
    if (this.stack.length == MAX_STACK) throw new Error('stack overflow');
    this.stack.push(value);
  }
  pop() {
    if (!this.stack.length) throw new Error('stack underflow');
    return this.stack.pop()!;
  }
  popSlice(back: number) {
    return back > 0 ? this.stack.splice(-back) : [];
  }
  peek(back: number) {
    if (back >= this.stack.length) throw new Error('stack underflow');
    return this.stack[this.stack.length - 1 - back];
  }
  traceTarget(target: HexString, max: number) {
    // IDEA: this could incremently build the needs map
    // instead of doing it during prove()
    let need = this.targets.get(target);
    if (!need) {
      // special value indicate accountProof instead of slot
      // false => account proof is optional (so far)
      need = [target, false];
      this.targets.set(target, need);
      if (this.targets.size > max) {
        throw new Error('too many targets');
      }
    }
    this.needs.push(need);
  }
  traceSlot(target: HexString, slot: bigint) {
    this.needs.push([target, slot]);
  }
  traceSlots(target: HexString, slots: bigint[]) {
    for (const slot of slots) {
      this.traceSlot(target, slot);
    }
  }
}

export abstract class AbstractProver {
  // maximum number of bytes from single read()
  // this is also constrained by proof count (1 proof per 32 bytes)
  maxReadBytes = 32 * 32; // unlimited
  // maximum number of proofs (M account + N storage, max 256)
  // if this number is too small, protocol can be changed to uint16
  maxUniqueProofs = 128; // max(256)
  // maximum number of targets (accountProofs)
  maxUniqueTargets = 32; // unlimited
  proofBatchSize = 64;
  // use getStorage() if no proof is cached yet
  useFastCalls = true;
  // how long to keep fast call values
  fastCallCacheMs = 0; // never cache
  checkSize(size: bigint | number) {
    if (size > this.maxReadBytes)
      throw new Error(`too many bytes: ${size} > ${this.maxReadBytes}`);
    return Number(size);
  }
  abstract isContract(target: HexString): Promise<boolean>;
  abstract getStorage(target: HexString, slot: bigint): Promise<HexString>;
  abstract prove(needs: Need[]): Promise<ProofSequence>;
  async evalDecoded(ops: HexString, inputs: readonly HexString[]) {
    return this.evalReader(new ProgramReader(hexToBytes(ops), inputs));
  }
  async evalRequest(req: EVMRequest) {
    return this.evalReader(ProgramReader.fromProgram(req));
  }
  async evalReader(reader: ProgramReader) {
    const vm = MachineState.create(reader.readByte());
    await this.evalCommand(reader, vm);
    return vm;
  }
  async evalCommand(reader: ProgramReader, vm: MachineState): Promise<void> {
    while (reader.remaining) {
      const op = reader.readByte();
      switch (op) {
        case OP_DEBUG: {
          // args: [string(label)] / stack: 0
          console.log(`DEBUG(${reader.readInputStr()})`, {
            target: vm.target,
            slot: vm.slot,
            exitCode: vm.exitCode,
            stack: await Promise.all(vm.stack.map(unwrap)),
            outputs: await vm.resolveOutputs(),
            needs: vm.needs,
          });
          continue;
        }
        case OP_TARGET: {
          // args: [] / stack: -1
          vm.target = addressFromHex(await unwrap(vm.pop()));
          vm.slot = 0n;
          vm.traceTarget(vm.target, this.maxUniqueTargets); // accountProof
          continue;
        }
        case OP_SLOT_ADD: {
          // args: [] / stack: -1
          vm.slot += BigInt(await unwrap(vm.pop()));
          continue;
        }
        case OP_SLOT_ZERO: {
          // args: [] / stack: 0
          vm.slot = 0n;
          continue;
        }
        case OP_SET_OUTPUT: {
          // args: [outputIndex] / stack: -1
          vm.outputs[vm.checkOutputIndex(reader.readByte())] = vm.pop();
          continue;
        }
        case OP_PUSH_INPUT: {
          // args: [inputIndex] / stack: 0
          vm.push(reader.readInput());
          continue;
        }
        case OP_PUSH_OUTPUT: {
          // args: [outputIndex] / stack: +1
          vm.push(vm.outputs[vm.checkOutputIndex(reader.readByte())]);
          continue;
        }
        case OP_PUSH_SLOT: {
          // args: [] / stack: +1
          vm.push(toHex(vm.slot, { size: 32 })); // current slot register
          continue;
        }
        case OP_PUSH_TARGET: {
          // args: [] / stack: +1
          vm.push(vm.target); // current target address
          continue;
        }
        case OP_DUP: {
          // args: [stack(rindex)] / stack: +1
          vm.push(vm.peek(reader.readByte()));
          continue;
        }
        case OP_POP: {
          // args: [] / stack: upto(-1)
          vm.stack.pop();
          continue;
        }
        case OP_READ_SLOTS: {
          // args: [count] / stack: +1
          const { target, slot } = vm;
          const count = reader.readByte();
          this.checkSize(count << 5);
          const slots = bigintRange(slot, count);
          vm.traceSlots(target, slots);
          vm.push(
            slots.length
              ? new Wrapped(async () =>
                  Promise.all(
                    slots.map((x) => this.getStorage(target, x))
                  ).then((x) => concatHex(x))
                )
              : '0x'
          );
          continue;
        }
        case OP_READ_BYTES: {
          // args: [] / stack: +1
          // https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#bytes-and-string
          const { target, slot } = vm;
          vm.traceSlot(target, slot);
          const first = await this.getStorage(target, slot);
          let size = parseInt(first.slice(64), 16); // last byte
          if ((size & 1) == 0) {
            // small
            vm.push(sliceHex(first, 0, size >> 1));
          } else {
            size = this.checkSize(BigInt(first) >> 1n);
            const slots = solidityArraySlots(slot, (size + 31) >> 5);
            vm.traceSlots(target, slots);
            vm.push(
              new Wrapped(async () =>
                Promise.all(slots.map((x) => this.getStorage(target, x)))
                  .then((x) => concatHex(x))
                  .then((x) => sliceHex(x, 0, size))
              )
            );
          }
          continue;
        }
        case OP_READ_ARRAY: {
          // args: [] / stack: +1
          const step = reader.readShort();
          if (!step) throw new Error('invalid element size');
          const { target, slot } = vm;
          vm.traceSlot(target, slot);
          let length = this.checkSize(
            BigInt(await this.getStorage(target, slot))
          );
          if (step < 32) {
            const per = (32 / step) | 0;
            length = ((length + per - 1) / per) | 0;
          } else {
            length = length * ((step + 31) >> 5);
          }
          const slots = solidityArraySlots(slot, length);
          vm.traceSlots(target, slots);
          slots.unshift(slot);
          vm.push(
            new Wrapped(async () =>
              Promise.all(slots.map((x) => this.getStorage(target, x))).then(
                (x) => concatHex(x)
              )
            )
          );
          continue;
        }
        case OP_REQ_CONTRACT: {
          // args: [] / stack: 0
          const need = vm.targets.get(vm.target);
          if (need) need[1] = true; // mark accountProof as required
          if (!(await this.isContract(vm.target))) {
            vm.exitCode = 1;
            return;
          }
          continue;
        }
        case OP_REQ_NONZERO: {
          // args: [back] / stack: 0
          const back = reader.readByte();
          if (/^0x0*$/.test(await unwrap(vm.peek(back)))) {
            vm.exitCode = 1;
            return;
          }
          continue;
        }
        case OP_EVAL_INLINE: {
          // args: [] / stack: -1 (program) & <program logic>
          const program = ProgramReader.fromEncoded(await unwrap(vm.pop()));
          const pos = reader.pos;
          await this.evalCommand(program, vm);
          reader.pos = pos;
          if (vm.exitCode) return;
          continue;
        }
        case OP_EVAL_LOOP: {
          // args: [back, flags] / stack: -1 (program) & -back (args)
          const back = reader.readByte();
          const flags = reader.readByte();
          const program = ProgramReader.fromEncoded(await unwrap(vm.pop()));
          const args = vm.popSlice(back).reverse();
          const vm2 = new MachineState(vm.outputs, vm.needs, vm.targets);
          for (const arg of args) {
            vm2.target = vm.target;
            vm2.slot = vm.slot;
            vm2.stack = [arg];
            vm2.exitCode = 0;
            program.pos = 0;
            await this.evalCommand(program, vm2);
            if (flags & (vm2.exitCode ? STOP_ON_FAILURE : STOP_ON_SUCCESS)) {
              break;
            }
          }
          if (flags & ACQUIRE_STATE) {
            vm.target = vm2.target;
            vm.slot = vm2.slot;
            vm.stack = vm2.stack;
          }
          continue;
        }
        case OP_SLOT_FOLLOW: {
          // args: [] / stack: -1
          vm.slot = solidityFollowSlot(vm.slot, await unwrap(vm.pop()));
          continue;
        }
        case OP_KECCAK: {
          // args: [] / stack: 0
          vm.push(keccak256(await unwrap(vm.pop())));
          continue;
        }
        case OP_CONCAT: {
          // args: [] / stack: -1
          const last = vm.pop();
          const v = [vm.pop(), last];
          vm.push(
            new Wrapped(async () =>
              Promise.all(v.map(unwrap)).then((x) => concatHex(x))
            )
          );
          continue;
        }
        case OP_SLICE: {
          // args: [off, size] / stack: 0
          const x = reader.readShort();
          const n = reader.readShort();
          const v = await unwrap(vm.pop());
          if (x + n > (v.length - 2) >> 1) throw new Error('slice overflow');
          vm.push(sliceHex(v, x, x + n));
          continue;
        }
        default: {
          throw new Error(`unknown op: ${op}`);
        }
      }
    }
  }
}

// standard caching protocol:
// account proofs stored under 0x{HexAddress}
// storage proofs stored under 0x{HexAddress}{HexSlot w/NoZeroPad} via makeStorageKey()

export function makeStorageKey(target: HexAddress, slot: bigint) {
  return `${target}${slot.toString(16)}`;
}

export function storageMapFromCache(cache: CachedMap<string, any>) {
  const map = new Map<HexString, bigint[]>();
  for (const key of cache.cachedKeys()) {
    const target = key.slice(0, 42) as Hex;
    let bucket = map.get(target);
    if (!bucket) {
      bucket = [];
      map.set(target, bucket);
    }
    if (key.length > 42) {
      bucket.push(BigInt('0x' + key.slice(42)));
    }
  }
  return map;
}
