// Exports the most recent replay session from Traccar's REST API to data/traccar-session.json.
// The website replays this file in the browser, so the website shows exactly what Traccar stored.
import fs from 'node:fs';
import { loadEnv } from '../lib/env.js';
import { Traccar } from '../lib/traccar.js';
const env = loadEnv();
const tc = new Traccar({ url: env.TRACCAR_URL, email: env.TRACCAR_EMAIL, password: env.TRACCAR_PASSWORD });
const dev = (await tc.devices()).find((d) => d.uniqueId === env.DEVICE_ID);
const to = Date.now(), from = to - 6 * 3600e3;
const all = await tc.history(dev.id, from, to);
// Split into sessions on gaps > 60 s; keep the last complete one.
const sessions = []; let cur = [];
for (const p of all) { if (cur.length && Date.parse(p.fixTime) - Date.parse(cur[cur.length - 1].fixTime) > 60e3) { sessions.push(cur); cur = []; } cur.push(p); }
if (cur.length) sessions.push(cur);
const s = sessions[sessions.length - 1];
const t0 = Date.parse(s[0].fixTime);
const out = { name: 'Simulated route', source: `Traccar ${env.TRACCAR_URL} /api/positions export, device ${env.DEVICE_ID} (id ${dev.id}), protocol ${s[0].protocol}`, exportedAt: new Date().toISOString(), sessionStart: s[0].fixTime, sessionEnd: s[s.length - 1].fixTime, count: s.length, attribution: 'Route derived from OpenStreetMap data, (c) OpenStreetMap contributors, ODbL 1.0', positions: s.map((p) => ({ id: p.id, t: (Date.parse(p.fixTime) - t0) / 1000, lat: p.latitude, lon: p.longitude, speedKn: p.speed, course: p.course, protocol: p.protocol })) };
fs.writeFileSync(new URL('../data/traccar-session.json', import.meta.url), JSON.stringify(out));
console.log('exported', out.count, 'positions', out.sessionStart, '->', out.sessionEnd, out.source);
