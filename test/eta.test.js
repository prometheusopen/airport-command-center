import test from 'node:test';
import assert from 'node:assert/strict';
import { EtaEngine, formatEta } from '../lib/eta.js';
import { cumulative, pointAt } from '../lib/geo.js';

// Straight 2 km east-west road at 41.98N; property at the east end.
const route = Array.from({ length: 21 }, (_, i) => ({ lat: 41.98, lon: -87.90 + i * 0.0012066 }));
const cum = cumulative(route); const L = cum[cum.length - 1];
const at = (d) => pointAt(route, cum, d);

test('route length is about 2 km', () => assert.ok(Math.abs(L - 2000) < 10, String(L)));

test('ETA = remaining / smoothed speed at steady speed', () => {
  const e = new EtaEngine({ route });
  let r; for (let s = 0; s <= 60; s += 2) r = e.update({ ...at(s * 10), speed: 10, time: s * 1000 });
  assert.ok(Math.abs(r.remainingM - (L - 600)) < 3, `remaining ${r.remainingM}`);
  assert.ok(Math.abs(r.etaS - (L - 600) / 10) < 1, `eta ${r.etaS}`);
  assert.equal(r.label, 'Estimated');
});

test('speed smoothing damps a single spike', () => {
  const e = new EtaEngine({ route, tauS: 20 });
  for (let s = 0; s <= 40; s += 2) e.update({ ...at(s * 10), speed: 10, time: s * 1000 });
  const r = e.update({ ...at(420), speed: 30, time: 42000 });
  assert.ok(r.speedSmooth < 13, `smoothed ${r.speedSmooth}`);
});

test('derives speed from fixes when the device sends none', () => {
  const e = new EtaEngine({ route });
  let r; for (let s = 0; s <= 100; s += 5) r = e.update({ ...at(s * 8), time: s * 1000 });
  assert.ok(Math.abs(r.speedSmooth - 8) < 0.5, `speed ${r.speedSmooth}`);
});

test('a stopped van gets a floor speed, not an infinite ETA', () => {
  const e = new EtaEngine({ route, floorSpeed: 4 });
  let r; for (let s = 0; s <= 120; s += 5) r = e.update({ ...at(500), speed: 0, time: s * 1000 });
  assert.ok(Number.isFinite(r.etaS)); assert.ok(Math.abs(r.etaS - (L - 500) / 4) < 2);
});

test("emits 'arriving' once when ETA drops to 60 s, then 'arrived' at the door", () => {
  const e = new EtaEngine({ route, geofenceM: 100 });
  const evs = [];
  for (let s = 0; s <= 260; s++) { const d = Math.min(L, s * 10); const r = e.update({ ...at(d), speed: d >= L ? 0 : 10, time: s * 1000 }); r.events.forEach((x) => evs.push({ ...x, s, eta: r.etaS })); }
  const arriving = evs.filter((x) => x.type === 'arriving'); const arrived = evs.filter((x) => x.type === 'arrived');
  assert.equal(arriving.length, 1); assert.ok(arriving[0].eta <= 60 && arriving[0].eta > 55, `eta at alert ${arriving[0].eta}`);
  assert.equal(arrived.length, 1); assert.ok(arrived[0].s >= arriving[0].s);
});

test('geofence entry fires the alert even when the ETA is still long (slow traffic)', () => {
  const e = new EtaEngine({ route, geofenceM: 300, floorSpeed: 1 });
  let ev = []; for (let s = 0; s <= 400; s++) { const d = Math.min(L, 1500 + s * 1); const r = e.update({ ...at(d), speed: 1, time: s * 1000 }); if (r.events.length) { ev = r.events; break; } }
  assert.equal(ev[0]?.type, 'arriving');
});

test('re-arms only after the ETA rises well above the alert (van turned back)', () => {
  const e = new EtaEngine({ route, geofenceM: 50, rearmS: 150 });
  let n = 0; const go = (d, t) => { const r = e.update({ ...at(d), speed: 10, time: t * 1000 }); n += r.events.filter((x) => x.type === 'arriving').length; };
  let t = 0; for (let d = 1000; d <= 1500; d += 10) go(d, t++); // alert fires near 1400 m
  for (let d = 1500; d >= 1380; d -= 10) go(d, t++); // small wobble: no second alert
  assert.equal(n, 1);
  e.reset(); n = 0; t = 0; for (let d = 0; d <= 1500; d += 10) go(d, t++); assert.equal(n, 1);
});

test('map matching does not jump backwards on GPS noise', () => {
  const e = new EtaEngine({ route });
  e.update({ ...at(1000), speed: 10, time: 0 });
  const r = e.update({ lat: at(990).lat + 0.00002, lon: at(990).lon, speed: 10, time: 1000 });
  assert.ok(r.along >= 985);
});

test('formatEta wording', () => { assert.equal(formatEta(30), 'under 1 min'); assert.equal(formatEta(70), 'about 1 min'); assert.equal(formatEta(400), 'about 7 min'); });

test('with per-road speeds, ETA follows the slower roads ahead instead of the current highway speed', () => {
  // First 1500 m at 25 m/s (expressway), last 500 m at 8 m/s (local street).
  const r2 = route.map((p, i) => ({ ...p, v: cum[i] <= 1500 ? 25 : 8 }));
  const e = new EtaEngine({ route: r2 });
  let r; for (let s = 0; s <= 20; s++) r = e.update({ ...at(s * 25), speed: 25, time: s * 1000 });
  const expected = (1500 - 500) / 25 + (L - 1500) / 8; // ~102 s
  assert.ok(Math.abs(r.etaS - expected) < 8, `eta ${r.etaS} vs ${expected}`);
  assert.ok(r.etaS > (L - 500) / 25 * 1.5, 'well above naive remaining/speed');
});
