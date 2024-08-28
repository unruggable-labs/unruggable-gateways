import { hexToBytes, toHex, zeroAddress, type Address } from 'viem';
import type { HexString } from './types.js';
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

export class EVMRequestV1 {
  constructor(
    public target: Address = zeroAddress,
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
  private addConst(x: HexString) {
    if (this.constants.length >= MAX_CONSTS)
      throw new Error('constants overflow');
    this.constants.push(x);
    return this.constants.length - 1;
  }
  private start(flags: number, slot: bigint | number) {
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
    this.commands.push(toHex(bytes32));
    buf.length = 0;
  }
  getStatic(slot: bigint | number) {
    return this.start(0, slot);
  }
  getDynamic(slot: bigint | number) {
    return this.start(FLAG_DYNAMIC, slot);
  }
  ref(i: number) {
    if (!Number.isInteger(i) || i < 0 || i >= MAX_CONSTS)
      throw new Error(`invalid reference: ${i}`);
    this.buf.push(OP_FOLLOW_REF | i);
    return this;
  }
  element(x: bigint | number) {
    return this.elementBytes(toHex(x, { size: 32 }));
  }
  elementStr(s: string) {
    return this.elementBytes(toHex(s));
  }
  elementBytes(x: HexString) {
    this.buf.push(OP_FOLLOW_CONST | this.addConst(x));
    return this;
  }
  offset(x: bigint | number) {
    this.buf.push(OP_ADD_CONST | this.addConst(toHex(x, { size: 32 })));
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
        const v = hexToBytes(cmd);
        req.zeroSlot();
        for (let i = 1; i < v.length; i++) {
          const op = v[i];
          if (op === OP_END) break;
          const operand = op & 0x1f;
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
