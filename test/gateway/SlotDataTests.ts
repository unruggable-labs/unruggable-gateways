import type { Contract } from 'ethers';
import { expect, test } from 'bun:test';

const cfg = { enableCcipRead: true };

// imo better to expect(await) than expect().resolves
export function runSlotDataTests(
  sdr: Contract,
  opts: { slotDataPointer?: any; quick?: boolean } = {}
) {
  test(
    'latest = 49',
    async () => {
      expect(await sdr.readLatest(cfg)).toEqual(49n);
    },
    { timeout: 60000 } // avoid cold-start timeout
  );
  if (!opts.quick) {
    test.skipIf(!opts.slotDataPointer)('pointer => latest = 49', async () => {
      expect(await sdr.readLatestViaPointer(cfg)).toEqual(49n);
    });
    test('name = "Satoshi"', async () => {
      expect(await sdr.readName(cfg)).toEqual('Satoshi');
    });
    test('highscores[0] = 1', async () => {
      expect(await sdr.readHighscore(0, cfg)).toEqual(1n);
    });
    test('highscores[latest] = 12345', async () => {
      expect(await sdr.readLatestHighscore(cfg)).toEqual(12345n);
    });
    test('highscorers[latest] = name', async () => {
      expect(await sdr.readLatestHighscorer(cfg)).toEqual('Satoshi');
    });
    test('realnames["Money Skeleton"] = "Vitalik Buterin"', async () => {
      expect(await sdr.readRealName('Money Skeleton', cfg)).toEqual(
        'Vitalik Buterin'
      );
    });
    test('realnames[highscorers[latest]] = "Hal Finney"', async () => {
      expect(await sdr.readLatestHighscorerRealName(cfg)).toEqual('Hal Finney');
    });
    test('zero = 0', async () => {
      expect(await sdr.readZero(cfg)).toEqual(0n);
    });
    test('root.str = "raffy"', async () => {
      expect(await sdr.readRootStr([], cfg)).toEqual('raffy');
    });
    test('root.map["a"].str = "chonk"', async () => {
      expect(await sdr.readRootStr(['a'], cfg)).toEqual('chonk');
    });
    test('root.map["a"].map["b"].str = "eth"', async () => {
      expect(await sdr.readRootStr(['a', 'b'], cfg)).toEqual('eth');
    });
    test('highscorers[keccak(...)] = "chonk"', async () => {
      expect(await sdr.readSlicedKeccak(cfg)).toEqual('chonk');
    });
  }
}
