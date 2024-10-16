import { test, describe, expect } from 'bun:test';
import { CachedMap, LRU } from '../../src/cached.js';

function wait(t: number) {
  return new Promise((f) => setTimeout(f, t));
}

describe('LRU', () => {
  test('0 element: no values should be cached', async () => {
    const c = new LRU<number, number>(0);
    c.setValue(1, 1);
    expect(c.size).toStrictEqual(0);
    c.setPending(1, Promise.resolve(1));
    expect(c.size).toStrictEqual(0);
    await c.cache(1, async () => 1);
    expect(c.size).toStrictEqual(0);
  });

  test('1 element: latest value should be cached', async () => {
    const c = new LRU<number, number>(1);
    c.setValue(1, 1);
    c.setValue(2, 2);
    expect(c.size).toStrictEqual(1);
    expect(c.peek(1)).toBeUndefined();
    expect(c.peek(2)).resolves.toStrictEqual(2);
    await c.cache(3, async () => 3);
    expect(c.peek(2)).toBeUndefined();
    expect(c.peek(3)).resolves.toStrictEqual(3);
  });

  test('n element: last n elements should be cached', async () => {
    const n = 3;
    const c = new LRU<number, number>(n);
    for (let i = 0; i < 100; i++) {
      c.setValue(i, 0);
      if (c.size == n) {
        expect([...c.keys()]).toStrictEqual(
          Array.from({ length: n }, (_, j) => i + j + 1 - n)
        );
      }
    }
  });

  test('truncate', async () => {
    const c = new LRU<number, number>();
    for (let i = 0; i < 5; i++) c.setValue(i, i);
    c.max = 1;
    expect(c.size).toStrictEqual(c.max);
  });

  test('excess', async () => {
    const c = new LRU<number, number>(2);
    const { promise, resolve } = Promise.withResolvers();
    const ps = Array.from({ length: 5 }, (_, i) =>
      c.setPending(
        i,
        promise.then(() => i)
      )
    );
    resolve();
    const vs = await Promise.all(ps);
    expect([...c.keys()]).toStrictEqual(vs.slice(-c.size));
  });

  test('pending elements touch() on resolution', async () => {
    const c = new LRU<number, number>(2);
    const { promise, resolve } = Promise.withResolvers<number>();
    c.setPending(1, promise);
    c.setValue(2, 2);
    expect([...c.keys()]).toStrictEqual([1, 2]);
    resolve(1);
    await promise;
    expect([...c.keys()]).toStrictEqual([2, 1]);
  });

  test('replaced elements do not touch() on resolution', async () => {
    const c = new LRU<number, number>(2);
    const { promise, resolve } = Promise.withResolvers<number>();
    c.setPending(1, promise);
    c.setValue(1, 2);
    resolve(1);
    expect(promise).resolves.toStrictEqual(1);
    expect(c.peek(1)).resolves.toStrictEqual(2);
  });
});

describe('CachedMap', () => {
  test('0 cache time should be empty post-resolution', async () => {
    const c = new CachedMap(0);
    await c.get('A', async () => 1);
    expect(c.cachedSize).toEqual(0);
    expect(
      c.get('A', async () => {
        throw 2;
      })
    ).rejects.toBe(2);
    expect(c.peek('A')).rejects.toBe(2);
  });

  test('infinite cache time should resolve and never schedule', async () => {
    const c = new CachedMap(Infinity);
    await c.get('A', async () => 1);
    expect(c.cachedRemainingMs('A') === Infinity);
    expect(c.nextExpirationMs).toEqual(Infinity);
    expect(
      c.get('A', async () => {
        throw 'wtf';
      })
    ).resolves.toBe(1);
  });

  test('general behavior', async () => {
    const c = new CachedMap(100);
    c.slopMs = 1;
    c.get('A', () => wait(100).then(() => 1));
    c.get('B', () => wait(150).then(() => 2), 200);
    expect(
      c.get('A', async () => {
        throw 'wtf';
      })
    ).resolves.toBe(1);
    expect(c.pendingSize).toBe(1);
    expect(c.cachedSize).toBe(1);
    expect(c.cachedRemainingMs('A')).toBeGreaterThan(90);
    expect(c.peek('B')).resolves.toBe(2);
    expect(c.cachedSize).toBe(2);
    expect(c.cachedValue('A')).resolves.toBe(1);
    expect(c.cachedRemainingMs('B')).toBeGreaterThan(190);
    await wait(110);
    expect(c.cachedSize).toBe(1);
    expect(c.cachedValue('B')).resolves.toBe(2);
    await wait(110);
    expect(c.cachedSize).toBe(0);
  });
});
