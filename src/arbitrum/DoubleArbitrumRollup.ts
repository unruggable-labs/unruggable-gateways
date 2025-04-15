import { EthProver } from '../eth/EthProver.js';
import { type RollupCommit, AbstractRollup } from '../rollup.js';
import type {
  ProofSequence,
  HexString,
  Provider,
  HexAddress,
} from '../types.js';
import type {
  ArbitrumCommit,
  ArbitrumConfig,
  AbstractArbitrumRollup,
} from './ArbitrumRollup.js';
import { type NitroCommit, NitroRollup } from './NitroRollup.js';
import { ABI_CODER } from '../utils.js';
import { GatewayRequest } from '../vm.js';

export type DoubleArbitrumCommit<C1> = RollupCommit<EthProver> & {
  readonly commit12: C1;
  readonly commit23: NitroCommit;
  readonly proofSeq12: ProofSequence;
};

// NOTE: when finalized, the delay is 2x7days
// rollup12 finalization works as expected
// rollup23 finalization is latestConfirmed or latestCreated (unfinalized)
// TODO: implement minAgeBlocks for rollup23
// TODO: implement BoLD support for rollup23

function createRequestForNitro(address: HexAddress, unfinalized = false) {
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

export class DoubleArbitrumRollup<
  C1 extends ArbitrumCommit,
  R1 extends AbstractArbitrumRollup<C1>,
> extends AbstractRollup<DoubleArbitrumCommit<C1>> {
  readonly rollup23: NitroRollup;
  readonly request: GatewayRequest;
  constructor(
    readonly rollup12: R1,
    provider3: Provider,
    config23: ArbitrumConfig,
    minAgeBlocks23 = 0
  ) {
    super({ provider1: rollup12.provider1, provider2: provider3 });
    this.rollup23 = new NitroRollup(
      { provider1: rollup12.provider2, provider2: provider3 },
      config23,
      minAgeBlocks23
    );
    this.rollup23.latestBlockTag = 'latest'; // TODO: explain this
    this.request = createRequestForNitro(
      config23.Rollup,
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
    commit: DoubleArbitrumCommit<C1>
  ): Promise<bigint> {
    return this.rollup12.fetchParentCommitIndex(commit.commit12);
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<DoubleArbitrumCommit<C1>> {
    const commit12 = await this.rollup12.fetchCommit(index);
    const state = await commit12.prover.evalRequest(this.request);
    const [proofSeq12, outputs] = await Promise.all([
      commit12.prover.prove(state.needs),
      state.resolveOutputs(),
    ]);
    const node = BigInt(outputs[0]);
    const commit23 = await this.rollup23.fetchCommit(node);
    return {
      index,
      prover: commit23.prover,
      proofSeq12,
      commit12,
      commit23,
    };
  }
  override encodeWitness(
    commit: DoubleArbitrumCommit<C1>,
    proofSeq23: ProofSequence
  ): HexString {
    return ABI_CODER.encode(
      ['(bytes,bytes[],bytes)[2]'],
      [
        [
          [
            commit.commit12.encodedRollupProof,
            commit.proofSeq12.proofs,
            commit.proofSeq12.order,
          ],
          [
            commit.commit23.encodedRollupProof,
            proofSeq23.proofs,
            proofSeq23.order,
          ],
        ],
      ]
    );
  }
  override windowFromSec(sec: number): number {
    return this.rollup12.windowFromSec(sec);
  }
}
