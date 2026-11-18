import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleArrivals, sampleDepartures, AIRLINES } from '../lib/samples.js';
const now = Date.UTC(2026, 10, 18, 23, 7);
test('sample rows are flagged and use fictional codes (letter-digit-letter)', () => {
  for (const r of [...sampleArrivals(now), ...sampleDepartures(now)]) { assert.equal(r.sample, true); assert.match(r.code, /^[A-Z]\d[A-Z]$/); }
  assert.ok(AIRLINES.every((a) => /^[A-Z]\d[A-Z]$/.test(a.code)));
});
test('deterministic for the same instant, and statuses follow the clock', () => {
  assert.deepEqual(sampleArrivals(now), sampleArrivals(now));
  for (const d of sampleDepartures(now)) { const m = (d.est - now) / 60e3; if (d.status === 'Boarding') assert.ok(m > 15 && m <= 40); if (d.status === 'Final call') assert.ok(m > 0 && m <= 15); }
  for (const a of sampleArrivals(now)) if (a.status === 'Landed') assert.ok(a.est <= now);
});
