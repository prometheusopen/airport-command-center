// One fetch, many screens. Server-side TTL cache with single-flight and stale-while-error.
//  - Fresh hit (age < ttl): served from memory, no upstream call.
//  - Expired: ONE upstream call, even if 50 screens ask at once (single-flight).
//  - Upstream error: keep serving the last good value, marked stale, until maxStale; then error.
export class TtlCache {
  constructor({ now = () => Date.now(), maxStaleMs = 6 * 3600e3 } = {}) { this.now = now; this.maxStaleMs = maxStaleMs; this.m = new Map(); this.inflight = new Map(); this.stats = { hits: 0, loads: 0, errors: 0, staleServed: 0 }; }
  async get(key, ttlMs, loader) {
    const t = this.now(); const hit = this.m.get(key);
    if (hit && t - hit.at < ttlMs) { this.stats.hits++; return { value: hit.value, at: hit.at, stale: false, ok: true }; }
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      this.stats.loads++;
      try { const value = await loader(); const at = this.now(); this.m.set(key, { value, at }); return { value, at, stale: false, ok: true }; }
      catch (e) {
        this.stats.errors++; const err = String(e?.message || e);
        if (hit && this.now() - hit.at < this.maxStaleMs) { this.stats.staleServed++; return { value: hit.value, at: hit.at, stale: true, ok: true, error: err }; }
        return { value: null, at: this.now(), stale: false, ok: false, error: err };
      } finally { this.inflight.delete(key); }
    })();
    this.inflight.set(key, p); return p;
  }
}
