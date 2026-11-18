import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastWave } from '../lib/wave.js';
const MIN = 60e3; const now = Date.UTC(2026, 10, 18, 23, 0);
const f = (min, seats, extra = {}) => ({ flight: 'A7U ' + min, seats, sched: now + min * MIN, est: now + min * MIN, delayMin: 0, status: 'On time', ...extra });

test('finds the busiest 30-minute window and computes guests = seats x LF x share', () => {
  const rows = [f(15, 100), f(100, 200), f(105, 200), f(115, 200), f(160, 50)];
  const w = forecastWave(rows, { now, loadFactor: 0.8, shareStaying: 0.05, heavyGuests: 20 });
  assert.equal(w.flights, 3); assert.equal(w.guests, Math.round(600 * 0.8 * 0.05));
  assert.equal(w.windowStart, now + 100 * MIN); assert.equal(w.windowEnd, now + 130 * MIN); assert.equal(w.heavy, true);
  assert.equal(w.curbFrom, w.windowStart + 25 * MIN);
});

test('ignores landed and cancelled rows, and flights beyond the horizon', () => {
  const rows = [f(-5, 300, { status: 'Landed' }), f(30, 300, { status: 'Cancelled' }), f(400, 300), f(40, 100)];
  const w = forecastWave(rows, { now, loadFactor: 1, shareStaying: 0.1 });
  assert.equal(w.flights, 1); assert.equal(w.guests, 10); assert.equal(w.heavy, false);
});

test('a live FAA arrival delay pushes on-time flights later but does not double-count an existing delay', () => {
  const rows = [f(20, 100), f(30, 100, { delayMin: 60, est: now + 90 * MIN, status: 'Delayed' })];
  const w = forecastWave(rows, { now, faaArrivalDelayMin: 45, loadFactor: 1, shareStaying: 0.1, windowMin: 10, stepMin: 10 });
  const land = (i) => w.bins.find((b) => b.flights && b.t <= now + i * MIN && b.t + 10 * MIN > now + i * MIN);
  assert.ok(land(65), 'on-time flight moved to +65 min'); assert.ok(land(90), 'delayed flight stays at +90 min');
  assert.match(w.method, /FAA arrival delay \(45 min\)/);
});

test('empty board gives no wave', () => { const w = forecastWave([], { now }); assert.equal(w.heavy, false); assert.equal(w.guests, 0); });
