import { EthProver } from '../eth/EthProver.js';
import { AbstractRollup, RollupCommit } from '../rollup.js';
import { ProofSequence, HexString, Provider, HexAddress } from '../types.js';
import { NitroCommit, NitroConfig, NitroRollup } from './NitroRollup.js';
import { ABI_CODER } from '../utils.js';
import { GatewayRequest } from '../vm.js';

export type DoubleNitroCommit = RollupCommit<EthProver> & {
  readonly commit12: NitroCommit;
  readonly commit23: NitroCommit;
  readonly proofSeq: ProofSequence;
};

// NOTE: when finalized, the delay is 2x7days
// rollup12 finalization works as expected
// rollup23 finalization is latestConfirmed or latestCreated (unfinalized)
// TODO: implement minAgeBlocks for rollup23

function createNodeRequest(address: HexAddress, unfinalized = false) {
  const SLOT_NODE_STORAGE = 117n;
  const SLOT_NODES_MAP = 118n;
  const SLOT_OFFSET_CONFIRM_DATA = 2n;
  //const SLOT_OFFSET_CREATED_AT = 4n;
  // uint64 private _latestConfirmed;
  // uint64 private _firstUnresolvedNode;
  // uint64 private _latestNodeCreated;
  // uint64 private _lastStakeBlock;
  // mapping(uint64 => Node) private _nodes;
  const req = new GatewayRequest(2); // 3
  req.setTarget(address).setSlot(SLOT_NODE_STORAGE).read();
  // TODO: figure out how to prove a slightly later node
  if (unfinalized) req.shr(128); // use latestNodeCreated instead of latestConfirmed
  req.push(0xffff_ffff_ffff_ffffn).and().dup().setOutput(0); // node
  req.setSlot(SLOT_NODES_MAP).follow(); // _nodes[node]
  req.getSlot(); // save
  req.offset(SLOT_OFFSET_CONFIRM_DATA).read().setOutput(1); // confirmData
  req.slot(); // restore
  // NOTE: createdAtBlock is L1 block not L2
  //req.offset(SLOT_OFFSET_CREATED_AT).read().shr(192).setOutput(2); // createdAtBlock
  return req;
}

export class DoubleNitroRollup extends AbstractRollup<DoubleNitroCommit> {
  readonly rollup23: NitroRollup;
  readonly nodeRequest: GatewayRequest;
  constructor(
    readonly rollup12: NitroRollup,
    provider3: Provider,
    config: NitroConfig,
    minAgeBlocks23 = rollup12.minAgeBlocks
  ) {
    super({ provider1: rollup12.provider1, provider2: provider3 });
    this.rollup23 = new NitroRollup(
      { provider1: rollup12.provider2, provider2: provider3 },
      config,
      minAgeBlocks23
    );
    this.rollup23.latestBlockTag = 'latest';
    this.nodeRequest = createNodeRequest(
      config.Rollup,
      this.rollup23.unfinalized
    );
  }
  override get unfinalized() {
    return this.rollup12.unfinalized || this.rollup23.unfinalized;
  }
  override fetchLatestCommitIndex(): Promise<bigint> {
    return this.rollup12.fetchLatestCommitIndex();
  }
  protected override _fetchParentCommitIndex(
    commit: DoubleNitroCommit
  ): Promise<bigint> {
    return this.rollup12.fetchParentCommitIndex(commit.commit12);
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<DoubleNitroCommit> {
    const commit12 = await this.rollup12.fetchCommit(index);
    const state = await commit12.prover.evalRequest(this.nodeRequest);
    const [proofSeq, outputs] = await Promise.all([
      commit12.prover.prove(state.needs),
      state.resolveOutputs(),
    ]);
    const node = BigInt(outputs[0]);
    const commit23 = await this.rollup23.fetchCommit(node);
    return {
      index,
      prover: commit23.prover,
      proofSeq,
      commit12,
      commit23,
    };
  }
  override encodeWitness(
    commit: DoubleNitroCommit,
    proofSeq: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(uint256,bytes32,bytes,bytes[],bytes,bytes32,bytes,bytes[],bytes)'],
      [
        [
          commit.index,
          commit.commit12.sendRoot,
          commit.commit12.rlpEncodedBlock,
          commit.proofSeq.proofs,
          commit.proofSeq.order,
          commit.commit23.sendRoot,
          commit.commit23.rlpEncodedBlock,
          proofSeq.proofs,
          proofSeq.order,
        ],
      ]
    );
  }
  override windowFromSec(sec: number): number {
    return this.rollup12.windowFromSec(sec);
  }
}
