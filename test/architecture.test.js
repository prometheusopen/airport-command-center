import test from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../lib/cache.js';
import { FeedChain, AeroDataBoxFeed, AviationStackFeed } from '../lib/flightfeed.js';
import { flightChanges, changeText } from '../lib/changes.js';
import { textAlertFrom, TwilioTextAlert } from '../lib/textalert.js';

test('cache: one upstream call for many concurrent screens, then fresh hits', async () => {
  let t = 0, calls = 0; const c = new TtlCache({ now: () => t });
  const load = async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return { n: calls }; };
  const rs = await Promise.all(Array.from({ length: 50 }, () => c.get('faa', 120e3, load)));
  assert.equal(calls, 1); assert.ok(rs.every((r) => r.value.n === 1));
  t = 60e3; await c.get('faa', 120e3, load); assert.equal(calls, 1);
  t = 130e3; await c.get('faa', 120e3, load); assert.equal(calls, 2);
});
test('cache: stale-while-error keeps the last good value, then gives up after maxStale', async () => {
  let t = 0; const c = new TtlCache({ now: () => t, maxStaleMs: 3600e3 });
  await c.get('k', 1000, async () => 'good'); t = 5000;
  const r = await c.get('k', 1000, async () => { throw new Error('502'); });
  assert.equal(r.value, 'good'); assert.equal(r.stale, true); assert.match(r.error, /502/);
  t = 4000e3; const r2 = await c.get('k', 1000, async () => { throw new Error('down'); }); assert.equal(r2.ok, false);
});
test('flight feed: paid adapters are stubs that never call the network; chain fails over to sample', async () => {
  const realFetch = globalThis.fetch; let netCalls = 0; globalThis.fetch = async () => { netCalls++; throw new Error('no'); };
  try {
    const chain = new FeedChain(['aerodatabox', 'aviationstack'], { aerodatabox: { apiKey: 'x', displayRights: true } });
    const r = await chain.get('arrivals', 'ORD', Date.UTC(2026, 10, 18, 18));
    assert.equal(r.source, 'sample'); assert.equal(r.sample, true); assert.ok(r.rows.length > 5);
    assert.deepEqual(r.tried.map((x) => x.id), ['aerodatabox', 'aviationstack']); assert.match(r.tried[0].skipped, /stub/);
    assert.equal(netCalls, 0);
    await assert.rejects(new AeroDataBoxFeed().arrivals('ORD'), /no request made/); await assert.rejects(new AviationStackFeed().departures('ORD'), /no request made/);
    assert.equal(netCalls, 0);
  } finally { globalThis.fetch = realFetch; }
  assert.throws(() => new FeedChain(['nope']), /unknown flight feed/);
});
test('flight changes: gate, delay, cancel, early', () => {
  const a = [{ id: 1, flight: 'A7U 214', city: 'Denver', gate: 'A3', delayMin: 0 }, { id: 2, flight: 'V3B 88', city: 'Boston', gate: 'B4', delayMin: 0 }, { id: 3, flight: 'K9R 5', city: 'Miami', gate: 'C1', delayMin: 0 }];
  const b = [{ ...a[0], gate: 'B7' }, { ...a[1], delayMin: 25 }, { ...a[2], cancelled: true, delayMin: -10 }];
  const ch = flightChanges(a, b); assert.deepEqual(ch.map((c) => c.type).sort(), ['cancelled', 'delay', 'early', 'gate']);
  assert.equal(changeText(ch.find((c) => c.type === 'gate')), 'A7U 214 (Denver) gate changed A3 to B7.');
});
test('text alerts: preview only; the Twilio stub is disabled and delivers nothing', async () => {
  const ta = textAlertFrom({ TEXT_ALERTS: 'twilio' }); const r = await ta.send({ text: 'Van 1 arriving', kind: 'shuttle' });
  assert.equal(r.delivered, false); assert.equal(r.twilio.delivered, false); assert.match(r.twilio.reason, /disabled/);
  assert.equal(new TwilioTextAlert().enabled, false); assert.equal(ta.preview.log.length, 1);
});
