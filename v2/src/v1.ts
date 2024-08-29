import type { HexString, BigNumberish, BytesLike } from './types.js';
import { ZeroAddress, hexlify, toBeHex, toUtf8Bytes, getBytes } from 'ethers';
import { EVMRequest } from './vm.js';

// export const GATEWAY_ABI = new ethers.Interface([
// 	`function getStorageSlots(address addr, bytes32[] commands, bytes[] constants) returns (bytes)`,
// ]);

const FLAG_DYNAMIC = 0x01;

const MAX_CONSTS = 32;

const OP_FOLLOW_CONST = 0 << 5;
const OP_FOLLOW_REF = 1 << 5;
const OP_ADD_CONST = 2 << 5;
const OP_END = 0xff;

const OPERAND_MASK = 0x1f;

export class EVMRequestV1 {
  constructor(
    public target: HexString = ZeroAddress,
    readonly commands: HexString[] = [],
    readonly constants: HexString[] = [],
    private readonly buf: number[] = []
  ) {}
  clone() {
    return new EVMRequestV1(
      this.target,
      this.commands.slice(),
      this.constants.slice(),
      this.buf.slice()
    );
  }
  private addConst(x: BytesLike) {
    if (this.constants.length >= MAX_CONSTS)
      throw new Error('constants overflow');
    this.constants.push(hexlify(x));
    return this.constants.length - 1;
  }
  private start(flags: number, slot: BigNumberish) {
    this.end();
    this.buf.push(flags);
    return this.offset(slot);
  }
  end() {
    const { buf } = this;
    if (!buf.length) return;
    if (buf.length < 32 && buf[buf.length - 1] != OP_END) buf.push(OP_END);
    const bytes32 = new Uint8Array(32);
    bytes32.set(buf);
    this.commands.push(hexlify(bytes32));
    buf.length = 0;
  }
  getStatic(slot: BigNumberish) {
    return this.start(0, slot);
  }
  getDynamic(slot: BigNumberish) {
    return this.start(FLAG_DYNAMIC, slot);
  }
  ref(i: number) {
    if (!Number.isInteger(i) || i < 0 || i >= MAX_CONSTS)
      throw new Error(`invalid reference: ${i}`);
    this.buf.push(OP_FOLLOW_REF | i);
    return this;
  }
  element(x: BigNumberish) {
    return this.elementBytes(toBeHex(x, 32));
  }
  elementStr(s: string) {
    return this.elementBytes(toUtf8Bytes(s));
  }
  elementBytes(x: BytesLike) {
    this.buf.push(OP_FOLLOW_CONST | this.addConst(x));
    return this;
  }
  offset(x: BigNumberish) {
    this.buf.push(OP_ADD_CONST | this.addConst(toBeHex(x, 32)));
    return this;
  }
  // encodeCall() {
  // 	this.end();
  // 	return GATEWAY_ABI.encodeFunctionData('getStorageSlots', [this.target, this.commands, this.constants]);
  // }
  v2() {
    this.end();
    const req = new EVMRequest();
    req.setTarget(this.target);
    for (const cmd of this.commands) {
      try {
        const v = getBytes(cmd);
        // before ADD_CONST was added first op is initial slot offset
        req.setSlot(this.constants[v[1] & OPERAND_MASK]);
        for (let i = 2; i < v.length; i++) {
          const op = v[i];
          if (op === OP_END) break;
          const operand = op & OPERAND_MASK;
          switch (op & 0xe0) {
            case OP_ADD_CONST: {
              req.pushBytes(this.constants[operand]).addSlot();
              continue;
            }
            case OP_FOLLOW_CONST: {
              req.pushBytes(this.constants[operand]).follow();
              continue;
            }
            case OP_FOLLOW_REF: {
              req.pushOutput(operand).follow();
              continue;
            }
            default:
              throw new Error(`unknown op: ${op}`);
          }
        }
        if (v[0] & FLAG_DYNAMIC) {
          req.readBytes();
        } else {
          req.read();
        }
        req.addOutput();
      } catch (err) {
        Object.assign(err!, { cmd });
        throw err;
      }
    }
    return req;
  }
}
