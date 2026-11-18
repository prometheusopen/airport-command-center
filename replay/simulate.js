// Turns data/route.json into a 1 Hz simulated drive (data/sim-track.json).
// This is SIMULATED, not recorded: speeds come from road class, acceleration/braking limits,
// curve slow-downs and two scripted signal stops. Labelled "Simulated route" everywhere.
import fs from 'node:fs';
import { cumulative, pointAt, bearing } from '../lib/geo.js';

const route = JSON.parse(fs.readFileSync(new URL('../data/route.json', import.meta.url), 'utf8'));
const pts = route.points; const cum = cumulative(pts); const L = cum[cum.length - 1];
const ACC = 1.5, DEC = 2.0, VMAX = 22; // m/s^2, m/s^2, m/s (~49 mph cap for a shuttle van)
const N = Math.ceil(L) + 1; const vcap = new Float64Array(N);
for (let d = 0; d < N; d++) { const p = pointAt(pts, cum, d); vcap[d] = Math.min(VMAX, pts[p.i].v * 0.95); }
// Curve slow-down: lateral accel <= 2.5 m/s^2 using heading change over 20 m.
for (let d = 10; d < N - 10; d++) {
  const a = pointAt(pts, cum, d - 10), b = pointAt(pts, cum, d), c = pointAt(pts, cum, d + 10);
  let dh = Math.abs(bearing(a, b) - bearing(b, c)); if (dh > 180) dh = 360 - dh;
  const k = (dh * Math.PI / 180) / 20; if (k > 1e-4) vcap[d] = Math.min(vcap[d], Math.sqrt(2.5 / k));
}
// Stops at the traffic signals / stop signs that OSM maps on this route. Signal waits are
// scripted (some green = no stop), stop signs are a 3 s full stop.
const SIGNAL_WAITS = [0, 24, 0, 14, 31, 0, 9];
const stops = []; let k = 0;
for (let i = 0; i < pts.length; i++) if (pts[i].ctl) { const w = pts[i].ctl === 'stop' ? 3 : SIGNAL_WAITS[k++ % SIGNAL_WAITS.length]; if (w) stops.push({ d: Math.round(cum[i]), wait: w, ctl: pts[i].ctl }); }
vcap[0] = 0; vcap[N - 1] = 0; for (const s of stops) vcap[Math.min(N - 1, s.d)] = 0;
// Forward/backward passes for acceleration limits (v^2 = v0^2 + 2 a d, 1 m steps).
const v = Float64Array.from(vcap);
for (let d = 1; d < N; d++) v[d] = Math.min(v[d], Math.sqrt(v[d - 1] ** 2 + 2 * ACC));
for (let d = N - 2; d >= 0; d--) v[d] = Math.min(v[d], Math.sqrt(v[d + 1] ** 2 + 2 * DEC));
// Integrate time over distance; insert waits; sample at 1 Hz.
let t = 0; const tAt = new Float64Array(N); const waits = new Map(stops.map((s) => [Math.min(N - 1, s.d), s.wait]));
for (let d = 1; d < N; d++) { const vm = Math.max(0.5, (v[d] + v[d - 1]) / 2); t += 1 / vm; if (waits.has(d)) t += waits.get(d); tAt[d] = t; }
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
const out = []; let d = 0;
for (let s = 0; s <= Math.ceil(t); s++) {
  while (d < N - 1 && tAt[d + 1] <= s) d++;
  const frac = d < N - 1 ? Math.max(0, Math.min(1, (s - tAt[d]) / ((tAt[d + 1] - tAt[d]) || 1))) : 0;
  const dd = Math.min(L, d + frac); const p = pointAt(pts, cum, dd); const q = pointAt(pts, cum, Math.min(L, dd + 5));
  const stopped = [...waits.keys()].some((k) => Math.abs(k - dd) < 0.6) && frac < 1;
  const noise = 2.5 / 111320; // ~2.5 m GPS jitter
  out.push({ t: s, lat: +(p.lat + rnd() * noise).toFixed(6), lon: +(p.lon + rnd() * noise / 0.744).toFixed(6), speed: +(stopped ? 0 : v[Math.round(dd)] || 0).toFixed(2), bearing: Math.round(bearing(p, q)) });
}
fs.writeFileSync(new URL('../data/sim-track.json', import.meta.url), JSON.stringify({ name: 'Simulated route', note: route.note, attribution: route.attribution, hz: 1, durationS: out.length - 1, points: out }));
console.log('simulated drive', out.length - 1, 's over', Math.round(L), 'm; stops', JSON.stringify(stops));
