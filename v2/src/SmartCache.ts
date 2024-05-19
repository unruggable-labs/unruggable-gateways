// SmartCache maintains 2 maps:
// 1) pending promises by key
// 2) settled promises by key + expiration
// requests for the same key return the same promise
// which may be from (1) or (2)
// too many pending {max_pending} are errors
// too many cached {max_cached} purge the oldest
// resolved promises are cached for {ms}
// rejected promises are cached for {ms_error}

const ERR = Symbol();

function clock() {
	return Math.ceil(performance.now());
}

export class SmartCache<K = any, V = any> {
	private cached: Map<K,[exp: number, promise: Promise<V>]> = new Map();
	private pending: Map<K,Promise<V>> = new Map();
	private timer: NodeJS.Timeout | undefined;
	private timer_t: number = Infinity;
	readonly ms_success: number;
	readonly ms_error: number;
	readonly ms_slop: number;
	readonly max_cached: number;
	readonly max_pending: number;

	constructor({ms = 60000, ms_error, ms_slop = 50, max_cached = 10000, max_pending = 100}: {
		ms?: number;
		ms_error?: number;
		ms_slop?: number;
		max_cached?: number;
		max_pending?: number;
	} = {}) {
		this.ms_success = ms;
		this.ms_error = ms_error ?? Math.ceil(ms / 4);
		this.ms_slop = ms_slop;
		this.max_cached = max_cached;
		this.max_pending = max_pending;
	}
	private schedule(exp: number) {
		let now = clock();
		let t = Math.max(now + this.ms_slop, exp);
		if (this.timer_t < t) return; // scheduled and shorter
		clearTimeout(this.timer); // kill old
		this.timer_t = t; // remember fire time
		this.timer = setTimeout(() => {
			let {cached} = this;
			let now = clock();
			let min = Infinity;
			for (let [key, [exp]] of cached) {
				if (exp < now) {
					cached.delete(key);
				} else {
					min = Math.min(min, exp); // find next
				}
			}
			this.timer_t = Infinity;
			if (cached.size) {
				this.schedule(min); // schedule for next
			} else {
				clearTimeout(this.timer);
			}
		}, t - now).unref(); // schedule
	}
	clear() {
		this.cached.clear();
		this.pending.clear();
		clearTimeout(this.timer);
		this.timer_t = Infinity;
	}
	add(key: K, value: V | Promise<V>, ms?: number) {
		if (!ms) ms = this.ms_success;
		let {cached, max_cached} = this;
		if (cached.size >= max_cached) { // we need room
			for (let key of [...cached.keys()].slice(-Math.ceil(max_cached/16))) { // remove batch
				cached.delete(key);
			}
		}
		let exp = clock() + ms;
		cached.set(key, [exp, Promise.resolve(value)]); // add cache entry
		this.schedule(exp);
	}
	get(key: K, fn: (key: K) => Promise<V>, ms?: number): Promise<V> {
		let {cached} = this;
		let c = cached.get(key); // fastpath, check cache
		if (c) {
			let [exp, q] = c;
			if (exp > clock()) return q; // still valid
			cached.delete(key); // expired
		}
		let {pending, max_pending} = this;
		if (pending.size >= max_pending) throw new Error('busy'); // too many in-flight
		let p = pending.get(key);
		if (p) return p; // already in-flight
		let q = fn(key); // begin
		p = q.catch(() => ERR).then(x => { // we got an answer
			pending.delete(key); // remove from pending
			this.add(key, q, x && x !== ERR ? ms : this.ms_error); // add original to cache
			return q; // resolve to original
		});
		pending.set(key, p); // remember in-flight
		return p; // return original
	}
}
