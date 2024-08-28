import type { Hash } from 'viem';

export type ScrollApiResponse = {
  '/last_batch_indexes': {
    all_index: number;
    committed_index: number;
    finalized_index: number;
  };
  '/batch': {
    batch: {
      commit_tx_hash: Hash;
      committed_at: `${number}`;
      created_at: `${number}`;
      end_block_number: number;
      end_chunk_hash: Hash;
      end_chunk_index: number;
      finalize_tx_hash: Hash;
      finalized_at: `${number}`;
      hash: Hash;
      index: number;
      rollup_status: 'finalized' | 'committed' | 'created';
      start_block_number: number;
      start_chunk_hash: Hash;
      start_chunk_index: number;
      total_tx_num: number;
    };
  };
};
