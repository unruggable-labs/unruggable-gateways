import { ZeroHash } from 'ethers/constants';
import { HexString, ProofSequence, HexString32, Provider } from '../types.js';
import { isRPCError, toPaddedHex, withResolvers } from '../utils.js';
import { AbstractProver, makeStorageKey, Need } from '../vm.js';

type RPCStarknetBlock = {
  block_hash: HexString32;
  block_number: number;
  new_root: HexString32;
  parent_hash: HexString32;
  sequencer_address: HexString32;
  starknet_version: string;
  status: 'PENDING' | 'ACCEPTED_ON_L2' | 'ACCEPTED_ON_L1' | 'REJECTED';
  timestamp: number;
  transactions: HexString32[];
};

type StarknetProofBinary = {
  binary: { left: HexString32; right: HexString32 };
};
type StarknetProofEdge = {
  edge: { child: HexString32; path: { value: HexString; len: number } };
};
type StarknetStorageProof = (StarknetProofBinary | StarknetProofEdge)[];
type StarknetContractProofHeader = {
  class_commitment: HexString32;
  state_commitment: HexString32;
  contract_proof: StarknetStorageProof;
};
type StarknetContractMissing = StarknetContractProofHeader & {
  contract_data: null;
};
type StarknetContractProof = StarknetContractProofHeader & {
  contract_data: {
    class_hash: HexString32;
    root: HexString32;
    nonce: HexString;
    storage_proofs: StarknetStorageProof[];
  };
};
type RPCStarknetGetProofs = StarknetContractProof | StarknetContractMissing;

function proofEdge(proof: StarknetStorageProof) {
  const last = proof[proof.length - 1];
  if (!('edge' in last)) throw new TypeError(`expected edge`);
  return last.edge;
}

function isContract(
  proof: RPCStarknetGetProofs
): proof is StarknetContractProof {
  return !!proof.contract_data;
}

export class StarknetProver extends AbstractProver {
  static async latest(provider: Provider) {
    //}, relBlockTag: string) {
    return new this(provider, await provider.send('starknet_blockNumber', []));
  }

  readonly blockId;
  constructor(provider: Provider, block: number) {
    super(provider);
    this.blockId = { block_number: block };
  }
  get block() {
    return this.blockId.block_number;
  }
  async fetchBlock(): Promise<RPCStarknetBlock> {
    return this.provider.send('starknet_getBlockWithTxHashes', [this.blockId]);
  }
  override async fetchStateRoot(): Promise<HexString32> {
    return (await this.fetchBlock()).new_root;
  }
  override async isContract(
    target: HexString32,
    fast = this.fast
  ): Promise<boolean> {
    target = target.toLowerCase();
    if (fast) {
      return this.cache.get(target, async (a) => {
        try {
          await this.provider.send('starknet_getClassHashAt', [
            this.blockId,
            a,
          ]);
          return true;
        } catch (err) {
          if (isRPCError(err, 20)) return false;
          throw err;
        }
      });
    }
    return isContract(await this.getProofs(target));
  }
  override async getStorage(
    target: HexString32,
    slot: bigint,
    fast = this.fast
  ): Promise<HexString> {
    target = target.toLowerCase();
    const accountProof: RPCStarknetGetProofs | undefined =
      await this.proofLRU.touch(target);
    if (accountProof && !isContract(accountProof)) return ZeroHash;
    const storageKey = makeStorageKey(target, slot);
    const storageProof: StarknetStorageProof | undefined =
      await this.proofLRU.touch(storageKey);
    if (storageProof) {
      return toPaddedHex(proofEdge(storageProof).path.value);
    }
    if (fast) {
      return this.provider.send('starknet_getStorageAt', [
        target,
        toPaddedHex(slot),
        this.blockId,
      ]);
    }
    const proofs = await this.getProofs(target, [slot]);
    return isContract(proofs)
      ? toPaddedHex(proofEdge(proofs.contract_proof).path.value)
      : ZeroHash;
  }
  override prove(_needs: Need[]): Promise<ProofSequence> {
    throw new Error('Method not implemented.');
  }
  async getProofs(
    target: HexString32,
    slots: bigint[] = []
  ): Promise<RPCStarknetGetProofs> {
    target = target.toLowerCase();
    const missing: number[] = [];
    const { promise, resolve, reject } = withResolvers();
    let accountProof:
      | Promise<RPCStarknetGetProofs>
      | RPCStarknetGetProofs
      | undefined = this.proofLRU.touch(target);
    if (!accountProof) {
      this.proofLRU.setFuture(
        target,
        promise.then(() => accountProof)
      );
    }
    const storageProofs: (
      | Promise<StarknetStorageProof>
      | StarknetStorageProof
      | undefined
    )[] = slots.map((slot, i) => {
      const key = makeStorageKey(target, slot);
      const p = this.proofLRU.touch(key);
      if (!p) {
        this.proofLRU.setFuture(
          key,
          promise.then(() => storageProofs[i])
        );
        missing.push(i);
      }
      return p;
    });
    if (!accountProof || missing.length) {
      try {
        const proofs = await this.fetchProofs(
          target,
          missing.map((x) => slots[x])
        );
        if (isContract(proofs)) {
          const v = proofs.contract_data.storage_proofs;
          proofs.contract_data.storage_proofs = [];
          missing.forEach((x, i) => (storageProofs[x] = v[i]));
        }
        accountProof = proofs;
        resolve();
      } catch (err) {
        reject(err);
        throw err;
      }
    }
    // reassemble
    const [a, v] = await Promise.all([
      accountProof,
      Promise.all(storageProofs),
    ]);
    this.checkStorageProofs(isContract(a), slots, v);
    const proofs = { ...a };
    if (isContract(proofs)) {
      proofs.contract_data = { ...proofs.contract_data };
      proofs.contract_data.storage_proofs = v as StarknetStorageProof[];
    }
    return proofs;
  }
  async fetchProofs(
    target: HexString32,
    slots: bigint[] = []
  ): Promise<RPCStarknetGetProofs> {
    const ps: Promise<RPCStarknetGetProofs>[] = [];
    for (let i = 0; ; ) {
      ps.push(
        this.provider.send('pathfinder_getProof', [
          this.blockId,
          target,
          slots
            .slice(i, (i += this.proofBatchSize))
            .map((slot) => toPaddedHex(slot)),
        ])
      );
      if (i >= slots.length) break;
    }
    const vs = await Promise.all(ps);
    if (isContract(vs[0])) {
      for (let i = 1; i < vs.length; i++) {
        vs[0].contract_data.storage_proofs.push(
          ...vs[i].contract_data!.storage_proofs
        );
      }
    }
    return vs[0];
  }
}
