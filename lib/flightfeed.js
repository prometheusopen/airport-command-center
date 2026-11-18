// FlightFeed: one interface, pluggable adapters, failover by config.
//   interface FlightFeed { id; label; live; ready(): {ok, reason}; arrivals(airport, now); departures(airport, now) }
// Rows use one shape: { id, airline, code, flight, city, apt, sched, est, delayMin, gate, prevGate?,
//   gateChangedAt?, status, seats, boardAt?, sample }.
// Phase 0 default is SampleFeed (fictional airlines, labelled "Sample data").
// AeroDataBox and AviationStack adapters are STUBS: they hold no key, make no network call, and
// report not-ready, so the chain fails over to the next adapter. Turning one on needs an API key,
// a paid plan, and written display rights for showing the data on public screens; none exist yet.
import { sampleArrivals, sampleDepartures } from './samples.js';

export class SampleFeed {
  id = 'sample'; label = 'Sample data (fictional airlines)'; live = false;
  ready() { return { ok: true }; }
  async arrivals(airport, now = Date.now()) { return sampleArrivals(now); }
  async departures(airport, now = Date.now()) { return sampleDepartures(now); }
}

class StubFeed {
  constructor(id, label, docs) { this.id = id; this.label = label; this.docs = docs; this.live = true; this.implemented = false; }
  ready(cfg = {}) {
    if (!this.implemented) return { ok: false, reason: `${this.label} adapter is a stub (not implemented in phase 0)` };
    if (!cfg.apiKey) return { ok: false, reason: 'no API key configured' };
    if (!cfg.displayRights) return { ok: false, reason: 'no written display rights on file' };
    return { ok: true };
  }
  async arrivals() { throw new Error(`${this.id}: disabled stub, no request made`); }
  async departures() { throw new Error(`${this.id}: disabled stub, no request made`); }
}
// https://doc.aerodatabox.com (FIDS endpoint: /flights/airports/iata/{code}/{from}/{to})
export class AeroDataBoxFeed extends StubFeed { constructor() { super('aerodatabox', 'AeroDataBox', 'https://doc.aerodatabox.com/'); } }
// https://aviationstack.com/documentation (endpoint: /v1/flights?arr_iata=)
export class AviationStackFeed extends StubFeed { constructor() { super('aviationstack', 'AviationStack', 'https://aviationstack.com/documentation'); } }

export const ADAPTERS = { sample: () => new SampleFeed(), aerodatabox: () => new AeroDataBoxFeed(), aviationstack: () => new AviationStackFeed() };

// Failover chain. order comes from config, e.g. FLIGHT_FEEDS="aerodatabox,aviationstack,sample".
// SampleFeed is always appended last so a screen never goes blank.
export class FeedChain {
  constructor(order = ['sample'], cfg = {}) {
    const ids = [...new Set([...order.map((s) => s.trim().toLowerCase()).filter(Boolean), 'sample'])];
    this.feeds = ids.map((id) => { if (!ADAPTERS[id]) throw new Error('unknown flight feed: ' + id); return ADAPTERS[id](); });
    this.cfg = cfg;
  }
  async get(kind, airport, now = Date.now()) {
    const tried = [];
    for (const f of this.feeds) {
      const r = f.ready(this.cfg[f.id] || {}); if (!r.ok) { tried.push({ id: f.id, skipped: r.reason }); continue; }
      try { const rows = await f[kind](airport, now); return { source: f.id, label: f.label, sample: !f.live, rows, tried }; }
      catch (e) { tried.push({ id: f.id, error: String(e.message || e) }); }
    }
    throw new Error('no flight feed available: ' + JSON.stringify(tried));
  }
  describe() { return this.feeds.map((f) => ({ id: f.id, label: f.label, live: f.live, ready: f.ready(this.cfg[f.id] || {}) })); }
}
