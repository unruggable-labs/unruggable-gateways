import type { HexString, BigNumberish } from '../types.js';
import type { EthProof } from './types.js';
import { ZeroHash } from 'ethers/constants';
import { keccak256 } from 'ethers/crypto';
import { decodeRlp } from 'ethers/utils';
import { toPaddedHex } from '../utils.js';
import { encodeRlp } from 'ethers';

// https://github.com/ethereum/consensus-specs/blob/dev/ssz/merkle-proofs.md
// https://eips.ethereum.org/EIPS/eip-7545
// https://eips.ethereum.org/EIPS/eip-6800

const BRANCH_NODE_SIZE = 17;
const LEAF_NODE_SIZE = 2;
const RLP_NULL = '0x80';

const NULL_TRIE_HASH = keccak256(RLP_NULL);

type TrieNode = {
  rlp: HexString;
  decoded: HexString[];
};

type AccountState = {
  nonce: HexString;
  balance: HexString;
  storageRoot: HexString;
  codeHash: HexString;
};

export function verifyAccountState(
  target: HexString,
  accountProof: EthProof,
  stateRoot: HexString
): AccountState | undefined {
  const rlp = verifyMerkleTrieValue(target, accountProof, stateRoot, true);
  if (!rlp) return;
  const decoded = assertRlpVector(rlp);
  if (decoded.length != 4) throw new Error('invalid account state');
  const [nonce, balance, storageRoot, codeHash] = decoded;
  return { nonce, balance, storageRoot, codeHash };
}

export function verifyStorageValue(
  slot: BigNumberish,
  storageProof: EthProof,
  storageRoot: HexString
) {
  if (storageRoot === NULL_TRIE_HASH) {
    //if (storageProof.length) throw new Error('expected empty proof');
    return ZeroHash;
  }
  const rlp = verifyMerkleTrieValue(
    toPaddedHex(slot),
    storageProof,
    storageRoot,
    true
  );
  if (!rlp) return ZeroHash;
  const decoded = decodeRlp(rlp);
  if (typeof decoded !== 'string') throw new Error('invalid storage value');
  return toPaddedHex(decoded);
}

// same arg order as MerkleTrie.get()
export function verifyMerkleTrieValue(
  key: HexString,
  proof: EthProof,
  root: HexString,
  secure?: boolean
) {
  try {
    const nodes: TrieNode[] = proof.map((rlp) => {
      const decoded = assertRlpVector(rlp);
      switch (decoded.length) {
        case BRANCH_NODE_SIZE:
        case LEAF_NODE_SIZE:
          return { rlp, decoded };
        default:
          throw new Error('node size');
      }
    });
    const { pathLength, keyRemainder, final } = walk(
      nodes,
      secure ? keccak256(key) : key,
      root
    );
    if (keyRemainder.length) {
      if (!final) throw new Error('key remainder');
      return;
    }
    const { decoded } = nodes[pathLength - 1];
    return decoded[decoded.length - 1];
  } catch (cause) {
    throw Object.assign(new Error('invalid proof', { cause }), {
      key,
      proof,
      root,
      secure,
    });
  }
}

const PREFIX_EXTENSION_EVEN = 0;
const PREFIX_EXTENSION_ODD = 1;
const PREFIX_LEAF_EVEN = 2;
const PREFIX_LEAF_ODD = 3;

// this mirrors MerkleTrie.sol
function walk(nodes: TrieNode[], key: HexString, root: HexString) {
  const keyNibbles = toNibbles(key);
  let nodeID = root;
  let keyIndex = 0;
  let keyDelta = 0;
  let pathLength = 0;
  outer: for (const node of nodes) {
    keyIndex += keyDelta;
    pathLength++;
    if (keyIndex == 0) {
      if (keccak256(node.rlp) != nodeID) throw new Error('invalid root hash');
    } else if (node.rlp.length >= 66) {
      if (keccak256(node.rlp) != nodeID) throw new Error('invalid branch hash');
    } else {
      if (node.rlp != nodeID) throw new Error('invalid leaf hash');
    }
    if (node.decoded.length == BRANCH_NODE_SIZE) {
      if (keyIndex == keyNibbles.length) break;
      nodeID = getNodeId(node.decoded[keyNibbles[keyIndex]]);
      keyDelta = 1;
    } else {
      const pathNibbles = toNibbles(node.decoded[0]);
      const pathRemainder = pathNibbles.subarray(pathNibbles[0] & 1 ? 1 : 2);
      const keyRemainder = keyNibbles.subarray(keyIndex);
      const shared = getSharedNibbleLength(pathRemainder, keyRemainder);
      if (keyRemainder.length < pathRemainder.length) {
        throw new Error('invalid key length');
      }
      switch (pathNibbles[0]) {
        case PREFIX_EXTENSION_EVEN:
        case PREFIX_EXTENSION_ODD: {
          if (shared != pathRemainder.length) {
            nodeID = RLP_NULL;
            break outer;
          } else {
            nodeID = getNodeId(node.decoded[1]);
            keyDelta = shared;
            continue;
          }
        }
        case PREFIX_LEAF_EVEN:
        case PREFIX_LEAF_ODD: {
          if (pathRemainder.length == shared && keyRemainder.length == shared) {
            keyIndex += shared;
          }
          nodeID = RLP_NULL;
          break outer;
        }
        default:
          throw new Error('invalid node prefix');
      }
    }
  }
  return {
    pathLength,
    keyRemainder: keyNibbles.slice(keyIndex),
    final: nodeID === RLP_NULL,
  };
}

function getNodeId(v: HexString) {
  return v.length < 66 ? encodeRlp(v) : v;
}

function assertRlpVector(rlp: HexString) {
  const v = decodeRlp(rlp);
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new Error('expected rlp vector');
  }
  return v as HexString[];
}
function toNibbles(s: HexString) {
  return Uint8Array.from(s.slice(2), (x) => parseInt(x, 16));
}
function getSharedNibbleLength(a: Uint8Array, b: Uint8Array) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] == b[i]) i++;
  return i;
}
