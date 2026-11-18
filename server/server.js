// Airport Command Center phase 0 server. Node built-ins only. Binds 127.0.0.1 (not public).
//   Player:  GET /            (lobby/restaurant screen)     Admin: GET /admin (content manager)
//   APIs:    /api/airport/status  /api/flights/arrivals|departures  /api/forecast/arrivals
//            /api/shuttle/state  /api/shuttle/stream (SSE)  /api/lobby/content?client=
//            /api/cms/clients[/:id[/items[/:itemId]|/publish]]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';
import { airportStatus } from '../lib/feeds.js';
import { sampleArrivals, sampleDepartures } from '../lib/samples.js';
import { forecastWave } from '../lib/wave.js';
import { EtaEngine } from '../lib/eta.js';
import { Traccar, toFix } from '../lib/traccar.js';
import { CmsStore } from '../cms/store.js';

const env = loadEnv();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(env.PORT || 8790); const AIRPORT = env.AIRPORT || 'ORD';
const PUB = path.join(ROOT, 'data/published');
const cms = new CmsStore(path.join(ROOT, 'data/cms.sqlite'));
if (cms.seedIfEmpty()) for (const c of cms.clients()) cms.publish(c.id, PUB);

// ---- Shuttle: live positions from Traccar -> ETA engine -> SSE clients
const route = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/route.json'), 'utf8'));
const engine = new EtaEngine({ route: route.points, property: route.property });
let shuttle = { status: 'waiting', note: 'No position from Traccar yet' }; const sse = new Set();
const tc = env.TRACCAR_URL ? new Traccar({ url: env.TRACCAR_URL, email: env.TRACCAR_EMAIL, password: env.TRACCAR_PASSWORD }) : null;
let deviceId = null; let lastFixTime = 0;
function onFix(f) {
  if (f.time <= lastFixTime) return; lastFixTime = f.time;
  if (engine.arrived && engine.last && f.time - engine.last.time > 60e3) engine.reset(); // new trip
  const r = engine.update(f);
  shuttle = { status: 'live', source: 'traccar', fix: f, eta: r, route: route.name };
  const msg = `data: ${JSON.stringify(shuttle)}\n\n`; for (const res of sse) res.write(msg);
}
async function startTraccar() {
  if (!tc) return;
  try {
    const dev = (await tc.devices()).find((d) => d.uniqueId === env.DEVICE_ID); deviceId = dev?.id;
    const ws = await tc.socket((ps) => ps.filter((p) => p.deviceId === deviceId).map(toFix).forEach(onFix));
    ws.onclose = () => setTimeout(startTraccar, 5000); ws.onerror = () => {};
    console.log('traccar websocket connected, device', deviceId);
  } catch (e) { console.error('traccar', e.message); setTimeout(startTraccar, 10000); }
}
startTraccar();

// ---- HTTP
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, no) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e5) no(new Error('too large')); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); });
const STATIC = { '/player/': path.join(ROOT, 'player'), '/player/lib/': path.join(ROOT, 'lib'), '/data/': path.join(ROOT, 'data') };
function serveStatic(res, p) {
  for (const pre of Object.keys(STATIC).sort((a, b) => b.length - a.length)) if (p.startsWith(pre)) {
    const f = path.normalize(path.join(STATIC[pre], p.slice(pre.length))); if (!f.startsWith(STATIC[pre])) return send(res, 403, 'no', 'text/plain');
    if (/\.(sqlite|env)$|\/raw\//.test(f)) return send(res, 403, 'no', 'text/plain');
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
  }
  return send(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  try {
    if (p === '/' || p === '/index.html') return send(res, 200, fs.readFileSync(path.join(ROOT, 'player/index.html')), TYPES['.html']);
    if (p === '/admin') return send(res, 200, fs.readFileSync(path.join(ROOT, 'cms/admin.html')), TYPES['.html']);
    if (p === '/api/airport/status') return send(res, 200, await airportStatus(AIRPORT));
    if (p === '/api/flights/arrivals') return send(res, 200, { sample: true, label: 'Sample data', rows: sampleArrivals() });
    if (p === '/api/flights/departures') return send(res, 200, { sample: true, label: 'Sample data', rows: sampleDepartures() });
    if (p === '/api/forecast/arrivals') { const st = await airportStatus(AIRPORT); return send(res, 200, forecastWave(sampleArrivals(), { faaArrivalDelayMin: st.faa?.arrivalDelayMin || 0 })); }
    if (p === '/api/shuttle/state') return send(res, 200, shuttle);
    if (p === '/api/shuttle/route') return send(res, 200, route);
    if (p === '/api/shuttle/stream') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }); res.write(`data: ${JSON.stringify(shuttle)}\n\n`); sse.add(res); req.on('close', () => sse.delete(res)); return; }
    if (p === '/api/lobby/content') { const id = u.searchParams.get('client') || 'sample-hotel'; const f = path.join(PUB, `${id.replace(/[^a-z0-9-]/g, '')}.json`); return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f)) : send(res, 404, { error: 'not published' }); }
    // ---- CMS admin API (local only; add auth before exposing beyond localhost)
    let m;
    if (p === '/api/cms/clients' && req.method === 'GET') return send(res, 200, cms.clients());
    if ((m = p.match(/^\/api\/cms\/clients\/([a-z0-9-]+)$/))) { if (req.method === 'GET') return send(res, 200, { client: cms.client(m[1]), items: cms.items(m[1]) }); if (req.method === 'PUT') return send(res, 200, cms.updateClient(m[1], await readBody(req))); }
    if ((m = p.match(/^\/api\/cms\/clients\/([a-z0-9-]+)\/items$/)) && req.method === 'POST') return send(res, 200, { id: cms.upsertItem(m[1], await readBody(req)) });
    if ((m = p.match(/^\/api\/cms\/clients\/([a-z0-9-]+)\/items\/(\d+)$/))) { if (req.method === 'PUT') return send(res, 200, { id: cms.upsertItem(m[1], { ...(await readBody(req)), id: m[2] }) }); if (req.method === 'DELETE') { cms.deleteItem(m[1], m[2]); return send(res, 200, { ok: true }); } }
    if ((m = p.match(/^\/api\/cms\/clients\/([a-z0-9-]+)\/publish$/)) && req.method === 'POST') return send(res, 200, cms.publish(m[1], PUB));
    return serveStatic(res, p);
  } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`ACC phase 0 on http://127.0.0.1:${PORT}  (admin: /admin)`));
