import { expect, test } from 'bun:test';
import { ethers } from 'ethers';

// run tests twice to check cache
function testTwice(name: string, fn: () => void) {
  for (let i = 0; i < 2; i++) {
    test(name, fn);
  }
}

export function runSlotDataTests(
  reader: ethers.Contract,
  ignoreCi: boolean = false
) {
  testTwice('latest = 49', () => {
    expect(reader.readLatest({ enableCcipRead: true })).resolves.toStrictEqual(
      49n
    );
  });
  testTwice('name = "Satoshi"', () => {
    expect(reader.readName({ enableCcipRead: true })).resolves.toStrictEqual(
      'Satoshi'
    );
  });
  testTwice('highscores[0] = 1', () => {
    expect(
      reader.readHighscore(0, { enableCcipRead: true })
    ).resolves.toStrictEqual(1n);
  });
  testTwice('highscores[latest] = 12345', async () => {
    expect(
      reader.readLatestHighscore({ enableCcipRead: true })
    ).resolves.toStrictEqual(12345n);
  });
  testTwice('highscorers[latest] = name', async () => {
    expect(
      await reader.readLatestHighscorer({ enableCcipRead: true })
    ).toStrictEqual('Satoshi');
  });
  testTwice('realnames["Money Skeleton"] = "Vitalik Buterin"', async () => {
    expect(
      await reader.readRealName('Money Skeleton', { enableCcipRead: true })
    ).toStrictEqual('Vitalik Buterin');
  });
  testTwice('realnames[highscorers[latest]] = "Hal Finney"', async () => {
    expect(
      await reader.readLatestHighscorerRealName({ enableCcipRead: true })
    ).toStrictEqual('Hal Finney');
  });
  if (process.env.IS_CI && !ignoreCi) {
    testTwice('zero = 0', async () => {
      expect(await reader.readZero({ enableCcipRead: true })).toStrictEqual(0n);
    });
  }
  testTwice('root.str = "raffy"', async () => {
    expect(
      await reader.readRootStr([], { enableCcipRead: true })
    ).toStrictEqual('raffy');
  });
  testTwice('root.map["a"].str = "chonk"', async () => {
    expect(
      await reader.readRootStr(['a'], { enableCcipRead: true })
    ).toStrictEqual('chonk');
  });
  testTwice('root.map["a"].map["b"].str = "eth"', async () => {
    expect(
      await reader.readRootStr(['a', 'b'], { enableCcipRead: true })
    ).toStrictEqual('eth');
  });
  testTwice('highscorers[keccak(...)] = "chonk"', async () => {
    expect(
      await reader.readSlicedKeccak({ enableCcipRead: true })
    ).toStrictEqual('chonk');
  });
}
