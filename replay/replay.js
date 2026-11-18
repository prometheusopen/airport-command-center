// Replays data/sim-track.json into Traccar over the real OsmAnd HTTP protocol (port 5055),
// exactly as Traccar Client on a phone would send it:
//   GET /?id=<uniqueId>&lat=..&lon=..&timestamp=<unix s>&speed=<knots>&bearing=..&accuracy=..
// Timestamps are wall-clock at send time; speeds are the simulated speeds. Default real time.
// Usage: node replay/replay.js [--every 2] [--rate 1]
import fs from 'node:fs';
import { loadEnv } from '../lib/env.js';
const env = loadEnv();
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const every = arg('every', 2), rate = arg('rate', 1);
const track = JSON.parse(fs.readFileSync(new URL('../data/sim-track.json', import.meta.url), 'utf8')).points;
const sel = track.filter((p, i) => i % every === 0 || i === track.length - 1);
const t0 = Date.now(); let sent = 0;
for (const p of sel) {
  const due = t0 + (p.t * 1000) / rate; const wait = due - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const q = new URLSearchParams({ id: env.DEVICE_ID, lat: p.lat, lon: p.lon, timestamp: Math.floor(Date.now() / 1000), speed: (p.speed / 0.514444).toFixed(2), bearing: p.bearing, accuracy: 5, batt: 100 });
  const r = await fetch(`${env.OSMAND_URL}/?${q}`, { method: 'POST' });
  if (!r.ok) { console.error('osmand', r.status); process.exit(1); }
  sent++; if (sent % 15 === 0) console.log(new Date().toISOString(), 'sent', sent, '/', sel.length);
}
console.log('done', sent, 'fixes from', new Date(t0).toISOString(), 'to', new Date().toISOString());
