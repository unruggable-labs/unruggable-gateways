// CachedMap maintains 2 maps:
// 1) pending promises by key
// 2) settled promises by key + expiration
// requests for the same key return the same promise
// which may be from (1) or (2)
// too many pending {maxPending} are errors
// too many cached {maxCached} purge the oldest
// resolved promises are cached for {cacheMs}
// rejected promises are cached for {errorMs}

// CachedValue does the same for a single value
// using an init-time generator

const ERR = Symbol();

function clock() {
  return performance.now();
}

export class CachedValue<T> {
  #exp: number = 0;
  #value: Promise<T> | undefined;
  errorMs = 250;
  constructor(
    readonly fn: () => Promise<T>,
    public cacheMs: number = 60000
  ) {}
  clear() {
    this.#value = undefined;
  }
  set(value: T) {
    this.#value = Promise.resolve(value);
    this.#exp = clock() + this.cacheMs;
  }
  get value() {
    return this.#value;
  }
  async get() {
    if (this.#value) {
      if (this.#exp > clock()) return this.#value;
      this.#value = undefined;
    }
    const p = (this.#value = this.fn());
    return p
      .catch(() => ERR)
      .then((x) => {
        if (this.#value === p) {
          this.#exp = clock() + (x === ERR ? this.errorMs : this.cacheMs);
        }
        return p;
      });
  }
}

type CacheRow<T> = [exp: number, promise: Promise<T>];

export class CachedMap<key = unknown, value = unknown> {
  private readonly cached: Map<key, CacheRow<value>> = new Map();
  private readonly pending: Map<key, Promise<value>> = new Map();
  private timer: Timer | undefined;
  private timer_t: number = Infinity;
  errorMs = 250; // how long to cache a rejected promise
  slopMs = 50; // reschedule precision
  maxPending = 100; // overflow causes rejections
  constructor(
    public cacheMs = 60000, // how long to cache a resolved promise
    public maxCached = 10000 // overflow clears oldest items
  ) {}
  private schedule(exp: number) {
    const now = clock();
    const t = Math.max(now + this.slopMs, exp);
    if (this.timer_t < t) return; // scheduled and shorter
    clearTimeout(this.timer); // kill old
    this.timer_t = t; // remember fire time
    if (t === Infinity) return;
    this.timer = setTimeout(() => {
      const now = clock();
      let min = Infinity;
      for (const [key, [exp]] of this.cached) {
        if (exp < now) {
          this.cached.delete(key);
        } else {
          min = Math.min(min, exp); // find next
        }
      }
      this.timer_t = Infinity;
      if (this.cached.size && min < Infinity) {
        this.schedule(min); // schedule for next
      } else {
        clearTimeout(this.timer);
      }
    }, t - now).unref(); // schedule
  }
  get pendingSize() {
    return this.pending.size;
  }
  get cachedSize() {
    return this.cached.size;
  }
  get nextExpirationMs() {
    return this.timer_t;
  }
  clear() {
    this.cached.clear();
    this.pending.clear();
    clearTimeout(this.timer);
    this.timer_t = Infinity;
  }
  // async resolvePending() {
  // 	await Promise.all(Array.from(this.pending.values()));
  // }
  set<valueOrOverride = value>(
    key: key,
    value: valueOrOverride | Promise<valueOrOverride>,
    ms?: number
  ) {
    if (!this.maxCached) return; // don't cache anything
    ms ??= this.cacheMs;
    if (ms > 0) {
      if (this.cached.size >= this.maxCached) {
        // we need room
        // TODO: this needs a heap
        for (const [key] of Array.from(this.cached)
          .sort((a, b) => a[1][0] - b[1][0])
          .slice(-Math.ceil(this.maxCached / 16))) {
          // remove batch
          this.cached.delete(key);
        }
      }
      const exp = clock() + ms;
      this.cached.set(key, [
        exp,
        Promise.resolve(value) as unknown as Promise<value>,
      ]); // add cache entry
      this.schedule(exp);
    } else {
      this.cached.delete(key);
    }
  }
  delete(key: key) {
    this.cached.delete(key);
    this.pending.delete(key);
  }
  cachedRemainingMs(key: key): number {
    const c = this.cached.get(key);
    if (c) {
      const rem = c[0] - clock();
      if (rem > 0) return rem;
    }
    return 0;
  }
  cachedValue<valueOrOverride = value>(
    key: key
  ): Promise<valueOrOverride> | undefined {
    const c = this.cached.get(key);
    if (c) {
      const [exp, q] = c;
      if (exp > clock()) return q as unknown as Promise<valueOrOverride>; // still valid
      this.cached.delete(key); // expired
    }
    return; // ree
  }
  cachedKeys(): IterableIterator<key> {
    return this.cached.keys();
  }
  peek<valueOrOverride = value>(
    key: key
  ): Promise<valueOrOverride> | undefined {
    return (
      this.cachedValue<valueOrOverride>(key) ??
      (this.pending.get(key) as unknown as Promise<valueOrOverride>)
    );
  }
  get<valueOrOverride = value>(
    key: key,
    fn: (key: key) => Promise<valueOrOverride>,
    ms?: number
  ): Promise<valueOrOverride> {
    let p = this.peek<valueOrOverride>(key);
    if (p) return p;
    if (this.pending.size >= this.maxPending) {
      throw new Error('busy'); // too many in-flight
    }
    const q = fn(key); // begin
    p = q
      .catch(() => ERR)
      .then((x) => {
        // we got an answer
        if (this.pending.delete(key)) {
          // remove from pending
          this.set(key, q, x === ERR ? this.errorMs : ms); // add original to cache if existed
        }
        return q; // resolve to original
      });
    this.pending.set(key, p as unknown as Promise<value>); // remember in-flight
    return p;
  }
}
