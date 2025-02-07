import type {
  BigNumberish,
  BytesLike,
  HexAddress,
  HexString,
  HexString32,
  ProofRef,
  ProofSequence,
  ProofSequenceV1,
  Provider,
} from './types.js';
import { ZeroAddress } from 'ethers/constants';
import { Contract } from 'ethers/contract';
import { Interface } from 'ethers/abi';
import { keccak256 } from 'ethers/crypto';
import { solidityPackedKeccak256 } from 'ethers/hash';
import { dataSlice, concat, getBytes, toUtf8Bytes } from 'ethers/utils';
import { asciiize } from '@resolverworks/ezccip';
import { unwrap, Wrapped, type Unwrappable } from './wrap.js';
import {
  fetchBlock,
  fetchBlockNumber,
  toUnpaddedHex,
  toPaddedHex,
  LATEST_BLOCK_TAG,
  isRevert,
} from './utils.js';
import { CachedMap, LRU } from './cached.js';
import { GATEWAY_OP as OP } from './ops.js';
import { ProgramReader } from './reader.js';

// all addresses are lowercase
// all values are hex-strings

type HexFuture = Unwrappable<number, HexString>;

async function peekSize(value: HexFuture) {
  if (value instanceof Wrapped) {
    if (value.payload) return value.payload;
    value = await value.get();
  }
  return (value.length - 2) >> 1;
}

// EVAL_LOOP flags
// the following should be equivalent to GatewayRequest.sol
const STOP_ON_SUCCESS = 1 << 0;
const STOP_ON_FAILURE = 1 << 1;
const ACQUIRE_STATE = 1 << 2;
const KEEP_ARGS = 1 << 3;

function isZeros(hex: HexString) {
  return /^0x0*$/.test(hex);
}
function uint256FromHex(hex: HexString) {
  // the following should be equivalent to:
  // GatewayVM.stackAsUint256()
  return hex === '0x' ? 0n : BigInt(hex.slice(0, 66));
}
function numberFromHex(hex: HexString) {
  const u = uint256FromHex(hex);
  if (u > 0xffffff) throw new Error('numeric overflow');
  return Number(u);
}
function addressFromHex(hex: HexString) {
  // the following should be equivalent to:
  // address(uint160(GatewayVM.stackAsUint256()))
  return (
    '0x' +
    (hex.length >= 66
      ? hex.slice(26, 66)
      : hex.slice(2).padStart(40, '0').slice(-40)
    ).toLowerCase()
  );
}
function bigintRange(start: bigint, length: number) {
  return Array.from({ length }, (_, i) => start + BigInt(i));
}
export function solidityArraySlots(slot: BigNumberish, length: number) {
  return length
    ? bigintRange(BigInt(solidityPackedKeccak256(['uint256'], [slot])), length)
    : [];
}
export function solidityFollowSlot(slot: BigNumberish, key: BytesLike) {
  // https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#mappings-and-dynamic-arrays
  return BigInt(keccak256(concat([key, toPaddedHex(slot)])));
}
export function pow256(base: bigint, exp: bigint) {
  let res = 1n;
  while (exp) {
    if (exp & 1n) res = BigInt.asUintN(256, res * base);
    exp >>= 1n;
    base = BigInt.asUintN(256, base * base);
  }
  return res;
}

export class GatewayProgram {
  static readonly Opcode = OP;
  constructor(readonly ops: number[] = []) {}
  clone() {
    return new GatewayProgram(this.ops.slice());
  }
  op(key: keyof typeof OP) {
    return this.addByte(OP[key]); // experimental
  }
  protected addByte(x: number) {
    if ((x & 0xff) !== x) throw new Error(`expected byte: ${x}`);
    this.ops.push(x);
    return this;
  }
  protected addBytes(v: Uint8Array) {
    this.ops.push(...v);
    return this;
  }
  toTuple() {
    return [this.encode()];
  }
  encode() {
    return Uint8Array.from(this.ops);
  }
  debug(label = '') {
    const v = toUtf8Bytes(label);
    return this.addByte(OP.DEBUG).addByte(v.length).addBytes(v);
  }
  read(n = 1) {
    return n == 1
      ? this.addByte(OP.READ_SLOT)
      : this.push(n).addByte(OP.READ_SLOTS);
  }
  readBytes() {
    return this.addByte(OP.READ_BYTES);
  }
  readHashedBytes() {
    return this.addByte(OP.READ_HASHED_BYTES);
  }
  readArray(step: number) {
    return this.push(step).addByte(OP.READ_ARRAY);
  }

  setTarget(x: HexString) {
    return this.push(x).target();
  }
  target() {
    return this.addByte(OP.SET_TARGET);
  }

  setOutput(i: number) {
    return this.push(i).output();
  }
  output() {
    return this.addByte(OP.SET_OUTPUT);
  }
  eval() {
    return this.push(true).evalIf();
  }
  evalIf() {
    return this.addByte(OP.EVAL);
  }
  evalLoop(
    opts: {
      success?: boolean;
      failure?: boolean;
      acquire?: boolean;
      keep?: boolean;
      count?: number;
    } = {}
  ) {
    let flags = 0;
    if (opts.success) flags |= STOP_ON_SUCCESS;
    if (opts.failure) flags |= STOP_ON_FAILURE;
    if (opts.acquire) flags |= ACQUIRE_STATE;
    if (opts.keep) flags |= KEEP_ARGS;
    // TODO: add recursion limit
    // TODO: add can modify output
    return this.push(opts.count ?? 255) // this should be >= MAX_STACK
      .addByte(OP.EVAL_LOOP)
      .addByte(flags);
  }
  exit(exitCode: number) {
    return this.push(false).assertNonzero(exitCode);
  }
  assertNonzero(exitCode: number) {
    return this.addByte(OP.ASSERT).addByte(exitCode);
  }
  requireContract(exitCode = 1) {
    return this.isContract().assertNonzero(exitCode); // NOTE: does not consume stack
  }
  requireNonzero(exitCode = 1) {
    return this.dup().assertNonzero(exitCode); // NOTE: does not consume stack
  }

  setSlot(x: BigNumberish) {
    return this.push(x).slot();
  }
  offset(x: BigNumberish) {
    return this.push(x).addSlot();
  }
  addSlot() {
    return this.addByte(OP.ADD_SLOT);
  }
  slot() {
    return this.addByte(OP.SET_SLOT);
  }
  follow() {
    return this.addByte(OP.FOLLOW);
  }
  followIndex() {
    return this.getSlot().keccak().slot().addSlot();
  }

  pop() {
    return this.addByte(OP.POP);
  }
  dup(back = 0) {
    return this.push(back).addByte(OP.DUP);
  }
  swap(back = 1) {
    return this.push(back).addByte(OP.SWAP);
  }

  pushOutput(i: number) {
    return this.push(i).addByte(OP.PUSH_OUTPUT);
  }
  pushStack(i: number) {
    return this.push(i).addByte(OP.PUSH_STACK);
  }
  push(x: BigNumberish | boolean) {
    const i = BigInt.asUintN(256, BigInt(x));
    if (!i) return this.addByte(OP.PUSH_0);
    const s = i.toString(16);
    const v = getBytes((s.length & 1 ? '0x0' : '0x') + s);
    this.ops.push(OP.PUSH_0 + v.length, ...v);
    return this;
  }
  pushStr(s: string) {
    return this.pushBytes(toUtf8Bytes(s));
  }
  pushBytes(v: BytesLike) {
    const u = getBytes(v);
    return this.addByte(OP.PUSH_BYTES).push(u.length).addBytes(u);
  }
  pushProgram(program: GatewayProgram) {
    return this.pushBytes(program.encode());
  }
  getSlot() {
    return this.addByte(OP.GET_SLOT);
  }
  getTarget() {
    return this.addByte(OP.GET_TARGET);
  }
  stackSize() {
    return this.addByte(OP.STACK_SIZE);
  }
  isContract() {
    return this.addByte(OP.IS_CONTRACT);
  }

  concat() {
    return this.addByte(OP.CONCAT);
  }
  keccak() {
    return this.addByte(OP.KECCAK);
  }
  slice(x: number, n: number) {
    return this.push(x).push(n).addByte(OP.SLICE);
  }
  length() {
    return this.addByte(OP.LENGTH);
  }

  plus() {
    return this.addByte(OP.PLUS);
  }
  twosComplement() {
    return this.not().push(1).plus();
  }
  subtract() {
    return this.twosComplement().plus();
  }
  times() {
    return this.addByte(OP.TIMES);
  }
  divide() {
    return this.addByte(OP.DIVIDE);
  }
  mod() {
    return this.addByte(OP.MOD);
  }
  pow() {
    return this.addByte(OP.POW);
  }
  and() {
    return this.addByte(OP.AND);
  }
  or() {
    return this.addByte(OP.OR);
  }
  xor() {
    return this.addByte(OP.XOR);
  }
  isZero() {
    return this.addByte(OP.IS_ZERO);
  }
  not() {
    return this.addByte(OP.NOT);
  }
  shl(shift: BigNumberish) {
    return this.push(shift).addByte(OP.SHIFT_LEFT);
  }
  shr(shift: BigNumberish) {
    return this.push(shift).addByte(OP.SHIFT_RIGHT);
  }
  eq() {
    return this.addByte(OP.EQ);
  }
  lt() {
    return this.addByte(OP.LT);
  }
  gt() {
    return this.addByte(OP.GT);
  }
  neq() {
    return this.eq().isZero();
  }
  lte() {
    return this.gt().isZero();
  }
  gte() {
    return this.lt().isZero();
  }
  dup2() {
    // [a, b] => [a, b, a] => [a, b, a, b]
    return this.dup(1).dup(1);
  }
  min() {
    //return this.dup2().gt().addByte(OP.SWAP).pop();
    return this.dup().dup(2).lt().addByte(OP.SWAP).pop();
  }
  max() {
    return this.dup().dup(2).gt().addByte(OP.SWAP).pop();
  }
}

// a request is just a program where the leading byte is the number of outputs
export class GatewayRequest extends GatewayProgram {
  constructor(outputCount = 0) {
    super();
    this.addByte(outputCount);
  }
  override clone() {
    const temp = new GatewayRequest();
    temp.ops.length = 0;
    temp.ops.push(...this.ops);
    return temp;
  }
  get outputCount() {
    return this.ops[0];
  }
  // the following functionality is not available in solidity!
  private ensureCapacity(n: number) {
    if (n < this.outputCount) throw new Error('invalid capacity');
    if (n > 0xff) throw new Error('output overflow');
    this.ops[0] = n;
  }
  // convenience for writing requests
  addOutput() {
    const i = this.outputCount;
    this.ensureCapacity(i + 1);
    return this.setOutput(i);
  }
  // convenience for draining stack into outputs
  drain(count: number) {
    const i = this.outputCount;
    this.ensureCapacity(i + count);
    while (count > 0) this.setOutput(i + --count);
    return this;
  }
}

export type TargetNeed = { target: HexAddress; required: boolean };
export type HashedNeed = {
  hash: HexFuture;
  value: HexFuture;
};
export type Need = TargetNeed | bigint | HashedNeed;

export function isTargetNeed(need: Need): need is TargetNeed {
  return typeof need === 'object' && need && 'target' in need;
}

export function requireV1Needs(needs: Need[]) {
  if (!needs.length) {
    throw new Error('expected needs');
  }
  const need = needs[0];
  if (!isTargetNeed(need)) {
    throw new Error('first need must be account');
  }
  const slots = needs.slice(1).map((need) => {
    if (typeof need !== 'bigint') {
      throw new Error('remaining needs must be storage');
    }
    return need;
  });
  return { ...need, slots };
}

// record the state of an evaluation
// registers: [slot, target, stack] + exitCode
// outputs are shared across eval()
// needs is sequence of necessary proofs
export class GatewayVM {
  static create(
    outputCount: number,
    maxStackSize = Infinity,
    allocBudget = Infinity
  ) {
    return new this(Array(outputCount).fill('0x'), maxStackSize, allocBudget);
  }
  target = ZeroAddress;
  slot = 0n;
  stack: HexFuture[] = [];
  exitCode = 0;
  constructor(
    readonly outputs: HexFuture[],
    readonly maxStack: number,
    public allocBudget: number,
    readonly needs: Need[] = [],
    readonly targets = new Map<HexString, TargetNeed>()
  ) {}
  checkAlloc(size: number) {
    this.allocBudget -= size;
    if (this.allocBudget < 0) throw new Error('too much allocation');
  }
  checkOutputIndex(i: number) {
    if (i >= this.outputs.length) {
      throw new Error(`invalid output index: ${i}/${this.outputs.length}`);
    }
    return i;
  }
  checkStackIndex(i: number) {
    if (i < 0 || i >= this.stack.length) {
      throw new Error(`invalid stack index: ${i}/${this.stack.length}`);
    }
    return i;
  }
  checkBack(back: number) {
    return this.checkStackIndex(this.stack.length - 1 - back);
  }
  resolveOutputs() {
    return Promise.all(this.outputs.map(unwrap));
  }
  resolveStack() {
    return Promise.all(this.stack.map(unwrap));
  }
  push(x: HexFuture) {
    if (this.stack.length >= this.maxStack) throw new Error('stack overflow');
    this.stack.push(x);
  }
  pushUint256(x: BigNumberish | boolean) {
    this.push(toPaddedHex(x));
  }
  pop() {
    if (!this.stack.length) throw new Error('stack underflow');
    return this.stack.pop()!;
  }
  popSlice(n: number) {
    if (this.stack.length < n) throw new Error('stack underflow');
    return this.stack.splice(this.stack.length - n, n);
  }
  async popNumber() {
    return numberFromHex(await unwrap(this.pop()));
  }
  async binaryOp(fn: (a: bigint, b: bigint) => bigint | boolean) {
    const [a, b] = await Promise.all(this.popSlice(2).map(unwrap));
    this.pushUint256(fn(uint256FromHex(a), uint256FromHex(b)));
  }
}

function checkSize(size: bigint | number, limit: number) {
  if (size > limit) throw new Error(`too many bytes: ${size} > ${limit}`);
  return Number(size);
}

const GATEWAY_EXT_ABI = new Interface([
  // ReadBytesAt.sol
  'function readBytesAt(uint256 slot) view returns (bytes)',
]);

// standard caching protocol:
// account proofs stored under 0x{HexAddress}
// storage proofs stored under 0x{HexAddress}{HexSlot w/NoZeroPad} via makeStorageKey()
export function makeStorageKey(target: HexAddress, slot: bigint) {
  return `${target}${slot.toString(16)}`;
}

export abstract class AbstractProver {
  // general proof cache
  readonly proofLRU = new LRU<string, any>(10000);
  // general async cache
  // default: deduplicates in-flight but does not cache
  readonly cache: CachedMap<string, any> = new CachedMap(0);
  // remember if contract supports readBytesAt()
  readonly readBytesAtSupported = new Map<HexAddress, boolean>();
  // maximum number of items on stack
  // should not be larger than MAX_STACK in GatewayProtocol.sol
  maxStackSize = 64; // max = unlimited
  // maximum number of proofs (M account + N storage)
  // note: if this number is too small, protocol can be changed to uint16
  maxUniqueProofs = 128; // max = 256
  // maximum number of targets (accountProofs)
  maxUniqueTargets = 32; // max = maxUniqueProofs
  // maximum number of proofs per _getProof
  proofBatchSize = 16; // max = unlimited
  // maximum bytes from single readHashedBytes(), readFetchedBytes()
  // when readBytesAt() is not available
  maxSuppliedBytes = 13125 << 5; // max = unlimited, ~420KB @ 30m gas
  // maximum bytes from single read(), readBytes()
  maxProvableBytes = 64 << 5; // max = 32 * proof count
  // maximum bytes allocated by concat() and slice()
  maxAllocBytes = 1 << 20; // max = server memory
  // maximum recursion depth
  maxEvalDepth = 5; // max = unlimited
  // use getCode() / getStorage() if no proof is cached yet
  fast = true;
  // console.log OP_DEBUG statements
  printDebug = true;

  constructor(readonly provider: Provider) {}

  checkProofCount(size: number) {
    if (size > this.maxUniqueProofs) {
      throw new Error(`too many proofs: ${size} > ${this.maxUniqueProofs}`);
    }
  }
  checkStorageProofs(isContract: boolean, slots: bigint[], proofs: any[]) {
    if (isContract) {
      // 20241112: devcon bug with linea-sepolia rpc
      // apply rpc check to all provers
      const n = proofs.reduce((a, x) => a + (x ? 1 : 0), 0);
      if (n !== slots.length) {
        throw new Error(`expected ${slots.length} storage proofs: got ${n}`);
      }
    } else {
      proofs.length = 0; // nuke the proofs
    }
  }
  proofMap() {
    const map = new Map<string, bigint[]>();
    for (const key of this.proofLRU.keys()) {
      const target = key.slice(0, 42);
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

  // abstract interface
  abstract isContract(target: HexAddress): Promise<boolean>;
  abstract getStorage(
    target: HexAddress,
    slot: bigint,
    fast?: boolean
  ): Promise<HexString>;
  abstract prove(needs: Need[]): Promise<ProofSequence>;
  async proveV1(needs: Need[]): Promise<ProofSequenceV1> {
    requireV1Needs(needs);
    const { proofs, order } = await this.prove(needs);
    return {
      accountProof: proofs[order[0]],
      storageProofs: Array.from(order.subarray(1), (i) => proofs[i]),
    };
  }
  // NOTE: if a prover cannot provide this value, throw
  // eg. LineaProver stateRoot is part of the rollup machinery
  // a block-derived LineaProver doesn't have a stateRoot
  // whereas LineaRollup => getCommit() => prover does (from L1)
  abstract fetchStateRoot(): Promise<HexString32>;

  // machine interface
  async evalDecoded(v: BytesLike) {
    return this.evalReader(ProgramReader.fromBytes(v));
  }
  async evalRequest(req: GatewayRequest) {
    return this.evalReader(ProgramReader.fromProgram(req));
  }
  async evalReader(reader: ProgramReader) {
    const vm = GatewayVM.create(
      reader.readByte(),
      this.maxStackSize,
      this.maxAllocBytes
    );
    await this.eval(reader, vm, 0);
    return vm;
  }
  private async eval(
    reader: ProgramReader,
    vm: GatewayVM,
    depth: number
  ): Promise<void> {
    if (depth > this.maxEvalDepth) throw new Error('max eval depth');
    while (reader.remaining) {
      const op = reader.readByte();
      if (op <= 32) {
        vm.pushUint256(reader.readBytes(op));
        continue;
      }
      switch (op) {
        case OP.SET_TARGET: {
          const target = addressFromHex(await unwrap(vm.pop()));
          // IDEA: this could incrementally build the needs map
          // instead of doing it during prove()
          let need = vm.targets.get(target);
          if (!need) {
            if (vm.targets.size >= this.maxUniqueTargets) {
              throw new Error('too many targets');
            }
            // NOTE: changing the target doesn't necessarily include an account proof
            // an account proof is included, either:
            // 1.) 2-level trie (stateRoot => storageRoot => slot)
            // 2.) we need to prove it is a contract (non-null codehash)
            // (native balance and other account state is not currently supported)
            need = { target, required: false };
            vm.targets.set(target, need);
          }
          vm.needs.push(need);
          vm.target = target;
          vm.slot = 0n; // slot is reset when target is changed
          continue;
        }
        case OP.FOLLOW: {
          vm.slot = solidityFollowSlot(vm.slot, await unwrap(vm.pop()));
          continue;
        }
        case OP.SET_SLOT: {
          vm.slot = uint256FromHex(await unwrap(vm.pop()));
          continue;
        }
        case OP.ADD_SLOT: {
          vm.slot += uint256FromHex(await unwrap(vm.pop()));
          continue;
        }
        case OP.SET_OUTPUT: {
          vm.outputs[vm.checkOutputIndex(await vm.popNumber())] = vm.pop();
          continue;
        }
        case OP.PUSH_OUTPUT: {
          vm.push(vm.outputs[vm.checkOutputIndex(await vm.popNumber())]);
          continue;
        }
        case OP.PUSH_BYTES: {
          vm.push(reader.readBytes(Number(reader.readUint())));
          continue;
        }
        case OP.GET_SLOT: {
          vm.pushUint256(vm.slot); // current slot register
          continue;
        }
        case OP.GET_TARGET: {
          vm.push(vm.target); // current target address
          continue;
        }
        case OP.STACK_SIZE: {
          vm.pushUint256(vm.stack.length);
          continue;
        }
        case OP.IS_CONTRACT: {
          const need = vm.targets.get(vm.target);
          if (need) need.required = true;
          vm.pushUint256(await this.isContract(vm.target));
          continue;
        }
        case OP.PUSH_STACK: {
          vm.push(vm.stack[vm.checkStackIndex(await vm.popNumber())]);
          continue;
        }
        case OP.DUP: {
          vm.push(vm.stack[vm.checkBack(await vm.popNumber())]);
          continue;
        }
        case OP.POP: {
          vm.stack.pop();
          continue;
        }
        case OP.SWAP: {
          const back = vm.checkBack(await vm.popNumber());
          const last = vm.stack.length - 1;
          const temp = vm.stack[back];
          vm.stack[back] = vm.stack[last];
          vm.stack[last] = temp;
          continue;
        }
        case OP.READ_SLOT: {
          const { target, slot } = vm;
          vm.needs.push(slot);
          vm.push(new Wrapped(32, () => this.getStorage(target, slot)));
          continue;
        }
        case OP.READ_SLOTS: {
          const { target, slot } = vm;
          const count = await vm.popNumber();
          const size = checkSize(count << 5, this.maxProvableBytes);
          const slots = bigintRange(slot, count);
          vm.needs.push(...slots);
          vm.push(
            new Wrapped(size, async () =>
              concat(
                await Promise.all(slots.map((x) => this.getStorage(target, x)))
              )
            )
          );
          continue;
        }
        case OP.READ_BYTES: {
          const { target, slot } = vm;
          const { value, slots } = await this.getStorageBytes(target, slot);
          vm.needs.push(slot, ...slots);
          vm.push(value);
          continue;
        }
        case OP.READ_HASHED_BYTES: {
          const { target, slot } = vm;
          const hash = vm.pop();
          const value = this.fetchUnprovenStorageBytes(target, slot);
          vm.needs.push({ hash, value });
          vm.push(value);
          continue;
        }
        case OP.READ_ARRAY: {
          const step = await vm.popNumber();
          if (!step) throw new Error('invalid element size');
          const { target, slot } = vm;
          let length = checkSize(
            uint256FromHex(await this.getStorage(target, slot)),
            this.maxProvableBytes
          );
          if (step < 32) {
            const per = (32 / step) | 0;
            length = ((length + per - 1) / per) | 0;
          } else {
            length = length * ((step + 31) >> 5);
          }
          const size = checkSize(length << 5, this.maxProvableBytes);
          const slots = solidityArraySlots(slot, length);
          slots.unshift(slot);
          vm.needs.push(...slots);
          vm.push(
            new Wrapped(size, async () =>
              concat(
                await Promise.all(slots.map((x) => this.getStorage(target, x)))
              )
            )
          );
          continue;
        }
        case OP.EVAL: {
          const [code, cond] = vm.popSlice(2);
          if (!isZeros(await unwrap(cond))) {
            const program = ProgramReader.fromBytes(await unwrap(code));
            await this.eval(program, vm, depth + 1);
            if (vm.exitCode) return;
          }
          continue;
        }
        case OP.EVAL_LOOP: {
          const flags = reader.readByte();
          const [code, n] = await Promise.all(vm.popSlice(2).map(unwrap));
          const program = ProgramReader.fromBytes(code);
          const vm2 = new GatewayVM(
            vm.outputs,
            vm.maxStack,
            vm.allocBudget,
            vm.needs,
            vm.targets
          );
          let count = Math.min(numberFromHex(n), vm.stack.length);
          while (count) {
            --count;
            vm2.target = vm.target;
            vm2.slot = vm.slot;
            vm2.stack = [vm.pop()];
            vm2.exitCode = 0;
            program.pos = 0;
            await this.eval(program, vm2, depth + 1);
            if (flags & (vm2.exitCode ? STOP_ON_FAILURE : STOP_ON_SUCCESS)) {
              if (~flags & KEEP_ARGS) {
                vm.popSlice(count);
              }
              if (flags & ACQUIRE_STATE) {
                vm.target = vm2.target;
                vm.slot = vm2.slot;
                vm.stack.push(...vm2.stack);
              }
              break;
            }
          }
          vm.allocBudget = vm2.allocBudget;
          continue;
        }
        case OP.ASSERT: {
          const code = reader.readByte();
          if (isZeros(await unwrap(vm.pop()))) {
            vm.exitCode = code;
            return;
          }
          continue;
        }
        case OP.KECCAK: {
          vm.push(keccak256(await unwrap(vm.pop())));
          continue;
        }
        case OP.CONCAT: {
          const v = concat(await Promise.all(vm.popSlice(2).map(unwrap)));
          vm.checkAlloc((v.length - 2) >> 1);
          vm.push(v);
          continue;
        }
        case OP.SLICE: {
          const [v, x, n] = await Promise.all(vm.popSlice(3).map(unwrap));
          const pos = numberFromHex(x);
          const size = numberFromHex(n);
          vm.checkAlloc(size);
          const len = (v.length - 2) >> 1;
          const end = pos + size;
          if (len >= end) {
            vm.push(dataSlice(v, pos, end));
          } else {
            const prefix = pos >= len ? '0x' : dataSlice(v, pos, len);
            vm.push(prefix.padEnd((size + 1) << 1, '0'));
          }
          continue;
        }
        case OP.LENGTH: {
          vm.pushUint256(await peekSize(vm.pop()));
          continue;
        }
        case OP.PLUS: {
          await vm.binaryOp((a, b) => a + b);
          continue;
        }
        case OP.TIMES: {
          await vm.binaryOp((a, b) => a * b);
          continue;
        }
        case OP.DIVIDE: {
          await vm.binaryOp((a, b) => a / b);
          continue;
        }
        case OP.MOD: {
          await vm.binaryOp((a, b) => a % b);
          continue;
        }
        case OP.POW: {
          await vm.binaryOp(pow256);
          continue;
        }
        case OP.AND: {
          await vm.binaryOp((a, b) => a & b);
          continue;
        }
        case OP.OR: {
          await vm.binaryOp((a, b) => a | b);
          continue;
        }
        case OP.XOR: {
          await vm.binaryOp((a, b) => a ^ b);
          continue;
        }
        case OP.SHIFT_LEFT: {
          await vm.binaryOp((x, shift) => x << shift);
          continue;
        }
        case OP.SHIFT_RIGHT: {
          await vm.binaryOp((x, shift) => x >> shift);
          continue;
        }
        case OP.EQ: {
          await vm.binaryOp((a, b) => a == b);
          continue;
        }
        case OP.LT: {
          await vm.binaryOp((a, b) => a < b);
          continue;
        }
        case OP.GT: {
          await vm.binaryOp((a, b) => a > b);
          continue;
        }
        case OP.IS_ZERO: {
          vm.pushUint256(isZeros(await unwrap(vm.pop())));
          continue;
        }
        case OP.NOT: {
          vm.pushUint256(~uint256FromHex(await unwrap(vm.pop())));
          continue;
        }
        case OP.DEBUG: {
          const label = reader.readSmallStr();
          if (this.printDebug) {
            // TODO: this could ask the prover for more information
            // eg. BlockProver => block w/ stateRoot
            // this could also include vm.storageRoot
            const [stack, outputs] = await Promise.all([
              vm.resolveStack(),
              vm.resolveOutputs(),
            ]);
            console.log(`DEBUG(${asciiize(label)})`, {
              target: vm.target,
              slot: vm.slot,
              exitCode: vm.exitCode,
              stack,
              outputs,
              needs: vm.needs,
            });
          }
          continue;
        }
        default: {
          throw new Error(`unknown op: ${op}`);
        }
      }
    }
  }
  fetchUnprovenStorageBytes(target: HexAddress, slot: bigint): HexFuture {
    target = target.toLowerCase();
    return new Wrapped(NaN, async () => {
      const can = this.readBytesAtSupported.get(target);
      if (can !== false) {
        try {
          const contract = new Contract(target, GATEWAY_EXT_ABI, this.provider);
          const v = await contract.readBytesAt(slot);
          if (!can) this.readBytesAtSupported.set(target, true);
          return v;
        } catch (err) {
          if (!can && isRevert(err))
            this.readBytesAtSupported.set(target, false);
        }
      }
      const { value } = await this.getStorageBytes(target, slot, true);
      return unwrap(value);
    });
  }
  async getStorageBytes(
    target: HexAddress,
    slot: bigint,
    fast?: boolean
  ): Promise<{
    value: HexFuture;
    size: number;
    slots: bigint[]; // note: does not include header slot!
  }> {
    // https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html#bytes-and-string
    const first = await this.getStorage(target, slot, fast);
    let size = parseInt(first.slice(64), 16); // last byte
    if ((size & 1) == 0) {
      // small
      size >>= 1;
      const value = dataSlice(first, 0, size); // will throw if size is invalid
      return { value, size, slots: [] };
    }
    size = checkSize(
      BigInt(first) >> 1n,
      fast ? this.maxSuppliedBytes : this.maxProvableBytes
    );
    if (size < 32) {
      throw new Error(`invalid storage encoding: ${target} @ ${slot}`);
    }
    const slots = solidityArraySlots(slot, (size + 31) >> 5);
    const value = new Wrapped(size, async () => {
      const v = await Promise.all(
        slots.map((x) => this.getStorage(target, x, fast))
      );
      return dataSlice(concat(v), 0, size);
    });
    return { value, size, slots };
  }
}

export interface LatestProverFactory<P extends AbstractProver> {
  latest(provider: Provider, relative?: BigNumberish): Promise<P>;
}

export abstract class BlockProver extends AbstractProver {
  protected static _createLatest<P extends BlockProver>(
    this: new (...a: ConstructorParameters<typeof BlockProver>) => P
  ) {
    return async (
      provider: Provider,
      relBlockTag: BigNumberish = LATEST_BLOCK_TAG
    ) => {
      return new this(provider, await fetchBlockNumber(provider, relBlockTag));
    };
  }
  readonly block: HexString;
  constructor(provider: Provider, block: BigNumberish) {
    super(provider);
    this.block = toUnpaddedHex(block);
  }
  fetchBlock() {
    return fetchBlock(this.provider, this.block);
  }
  override async fetchStateRoot() {
    return (await this.fetchBlock()).stateRoot;
  }
  protected abstract _proveNeed(
    need: TargetNeed,
    accountRef: ProofRef,
    storageRefs: Map<bigint, ProofRef>
  ): Promise<void>;
  override async prove(needs: Need[]) {
    // reduce an ordered list of needs into a deduplicated list of proofs
    // provide empty proofs for non-contract slots
    type Bucket = {
      need: TargetNeed;
      ref: ProofRef;
      map: Map<bigint, ProofRef>;
    };
    const promises: Promise<any>[] = [];
    const buckets = new Map<HexString, Bucket>();
    const refs: ProofRef[] = [];
    let nullRef: ProofRef | undefined;
    const createRef = () => {
      const ref = { id: refs.length, proof: '0x' };
      refs.push(ref);
      return ref;
    };
    let bucket: Bucket | undefined;
    const order = needs.map((need) => {
      if (isTargetNeed(need)) {
        // accountProof
        // we must prove this value since it leads to a stateRoot
        bucket = buckets.get(need.target);
        if (!bucket) {
          bucket = {
            need,
            ref: createRef(),
            map: new Map(),
          };
          buckets.set(need.target, bucket);
        }
        return bucket.ref;
      } else if (typeof need === 'bigint') {
        // storageProof (for targeted account)
        // bucket can be undefined if a slot is read without a target
        // this is okay because the initial machine state is NOT_A_CONTRACT
        if (!bucket) return (nullRef ??= createRef());
        let ref = bucket.map.get(need);
        if (!ref) {
          ref = createRef();
          bucket.map.set(need, ref);
        }
        return ref;
      } else {
        // currently, this is just HashedNeed
        // TODO: check the hash?
        const ref = createRef();
        promises.push((async () => (ref.proof = await unwrap(need.value)))());
        return ref;
      }
    });
    this.checkProofCount(refs.length);
    for (const bucket of buckets.values()) {
      // NOTE: technically, we only need to prove the account
      // if the state was accessed or storage was read
      // because we can set an invalid storageRoot
      // but this is rare and makes machine complicated
      // as it requires 3 states: proven true, proven false, unknown
      // so far, only ZKSync has this functionality due to gas:
      // see: ZKSyncHookVerifierHooks.sol:verifyAccountState()
      // see: ZKSyncProver.ts:prove()
      //if (bucket.need.required || bucket.map.size) {
      promises.push(this._proveNeed(bucket.need, bucket.ref, bucket.map));
    }
    await Promise.all(promises);
    return {
      proofs: refs.map((x) => x.proof),
      order: Uint8Array.from(order, (x) => x.id),
    };
  }
}
