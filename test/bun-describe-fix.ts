import { test, describe as describe0 } from 'bun:test';

// bun:test is shit
// using a beforeAll() is disgusting for test setup
// this technique makes the describe() an implicit beforeAll()
// and enables async test() construction

export function describe(label: string, fn: () => void | Promise<void>) {
  describe0(label, async () => {
    try {
      await fn(); // must be awaited
    } catch (cause) {
      test('init()', () => {
        // failure shows up as a synthetic test
        throw cause;
      });
    }
  });
}

// sigh...
describe.skipIf =
  (skip: boolean) =>
  (...a: Parameters<typeof describe>) =>
    skip ? describe0.skip(a[0], () => {}) : describe(...a);
