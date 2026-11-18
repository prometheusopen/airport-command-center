import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EtaEngine } from '../lib/eta.js';
// Integration: the position log exported from our Traccar server (OsmAnd protocol replay of the
// simulated route) run through the ETA engine, the same way the website replays it.
const route = JSON.parse(fs.readFileSync(new URL('../data/route.json', import.meta.url)));
const s = JSON.parse(fs.readFileSync(new URL('../data/traccar-session.json', import.meta.url)));
test('Traccar session export is an osmand session along the route', () => {
  assert.ok(s.count > 100); assert.ok(s.positions.every((p) => p.protocol === 'osmand'));
});
test('alert fires 45-90 s before the van actually arrives; arrival event fires at the end', () => {
  const e = new EtaEngine({ route: route.points, property: route.property }); const end = s.positions.at(-1).t; const ev = {};
  let errs = [];
  for (const p of s.positions) { const r = e.update({ lat: p.lat, lon: p.lon, speed: p.speedKn * 0.514444, time: p.t * 1000 }); errs.push(Math.abs(r.etaS - (end - p.t))); for (const x of r.events) ev[x.type] ??= p.t; assert.ok(r.offRouteM < 30); }
  assert.ok(end - ev.arriving >= 45 && end - ev.arriving <= 90, `alert ${end - ev.arriving}s before arrival`);
  assert.ok(end - ev.arrived <= 15, `arrived at ${ev.arrived}, end ${end}`);
  const mae = errs.reduce((a, b) => a + b, 0) / errs.length; console.log(`ETA mean absolute error over the session: ${mae.toFixed(1)} s`);
  assert.ok(mae < 45);
});
