// Builds the "Simulated route" from OpenStreetMap road data with our own shortest-time router.
// Input: data/raw/osm-ord-rosemont.json (Overpass export, (c) OpenStreetMap contributors, ODbL 1.0).
// Output: data/route.json (route polyline + per-point road class) and data/map.json (simplified
// background drawing). Both are derived from OSM and therefore carry ODbL attribution.
import fs from 'node:fs';
import { haversine, projector } from '../lib/geo.js';

const RAW = new URL('../data/raw/osm-ord-rosemont.json', import.meta.url);
const START = { lat: 41.9868, lon: -87.8883, label: 'Airport shuttle pickup (demo)' };
const PROPERTY = { lat: 41.9790, lon: -87.8627, label: 'Sample Hotel (fictional)' };
// Free-flow speeds (m/s) per OSM class; used only to pick the route and shape the simulation.
const SPEED = { motorway: 24.6, motorway_link: 13.4, trunk: 20, trunk_link: 13.4, primary: 15.6, primary_link: 11, secondary: 13.4, secondary_link: 10, tertiary: 11.2, tertiary_link: 9, unclassified: 11.2, residential: 8.9, service: 6.7 };
const osm = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const roads = osm.elements.filter((e) => e.tags.highway && SPEED[e.tags.highway] && !['parking_aisle', 'drive-through'].includes(e.tags.service) && e.tags.access !== 'private' && e.tags.access !== 'no');

const key = (p) => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
const nodes = new Map(); const adj = new Map();
const addNode = (p) => { const k = key(p); if (!nodes.has(k)) { nodes.set(k, { lat: p.lat, lon: p.lon }); adj.set(k, []); } return k; };
for (const w of roads) {
  const g = w.geometry; const v = SPEED[w.tags.highway]; const ow = w.tags.oneway; const fwd = ow !== '-1'; const back = !(ow === 'yes' || ow === '1' || ow === '-1' || w.tags.highway === 'motorway' || w.tags.junction === 'roundabout') || ow === '-1';
  for (let i = 0; i + 1 < g.length; i++) {
    const a = addNode(g[i]), b = addNode(g[i + 1]); const d = haversine(g[i], g[i + 1]); const c = d / v;
    if (fwd) adj.get(a).push({ to: b, c, d, cls: w.tags.highway, name: w.tags.name || w.tags.ref || '' });
    if (back) adj.get(b).push({ to: a, c, d, cls: w.tags.highway, name: w.tags.name || w.tags.ref || '' });
  }
}
const nearest = (p) => { let best, bd = Infinity; for (const [k, n] of nodes) { if (!adj.get(k).length) continue; const d = haversine(p, n); if (d < bd) { bd = d; best = k; } } return best; };
const s = nearest(START), t = nearest(PROPERTY);
// Dijkstra with a simple binary heap.
const dist = new Map([[s, 0]]); const prev = new Map(); const heap = [[0, s]];
const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
while (heap.length) { const [c, u] = pop(); if (u === t) break; if (c > (dist.get(u) ?? Infinity)) continue; for (const e of adj.get(u)) { const nc = c + e.c; if (nc < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nc); prev.set(e.to, { from: u, e }); push([nc, e.to]); } } }
if (!prev.has(t)) throw new Error('no route');
const path = []; let cur = t; while (cur !== s) { const p = prev.get(cur); path.unshift({ ...nodes.get(cur), cls: p.e.cls, name: p.e.name }); cur = p.from; }
path.unshift({ ...nodes.get(s), cls: path[0].cls, name: path[0].name });
let total = 0; for (let i = 1; i < path.length; i++) total += haversine(path[i - 1], path[i]);
const names = []; for (const p of path) if (p.name && names[names.length - 1] !== p.name) names.push(p.name);

// Background drawing: project, keep main classes, simplify (Douglas-Peucker 4 m).
const proj = projector({ lat: (START.lat + PROPERTY.lat) / 2, lon: (START.lon + PROPERTY.lon) / 2 });
function dp(pts, eps) { if (pts.length < 3) return pts; let md = 0, mi = 0; const [a, b] = [pts[0], pts[pts.length - 1]]; for (let i = 1; i < pts.length - 1; i++) { const p = pts[i]; const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; const d = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / L; if (d > md) { md = d; mi = i; } } if (md <= eps) return [a, b]; return dp(pts.slice(0, mi + 1), eps).slice(0, -1).concat(dp(pts.slice(mi), eps)); }
const layer = (e) => { const t = e.tags; if (t.aeroway === 'runway') return 'runway'; if (t.aeroway === 'taxiway') return 'taxiway'; if (t.aeroway === 'terminal' || t.building === 'terminal') return 'terminal'; if (t.waterway) return 'river'; if (/motorway/.test(t.highway)) return 'motorway'; if (/^(trunk|primary|secondary)/.test(t.highway)) return 'major'; if (/^(tertiary|unclassified|residential)/.test(t.highway)) return 'minor'; return null; };
const map = { attribution: 'Map data (c) OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright)', origin: proj.inv({ x: 0, y: 0 }), layers: {} };
for (const e of osm.elements) { const L = layer(e); if (!L || !e.geometry) continue; const pts = dp(e.geometry.map((g) => proj.fwd(g)), L === 'taxiway' ? 8 : 4).map((p) => [Math.round(p.x), Math.round(p.y)]); (map.layers[L] ||= []).push(pts); }
// Mark traffic signals / stop signs on the route (OSM nodes highway=traffic_signals|stop, (c) OSM contributors, ODbL).
const sigs = JSON.parse(fs.readFileSync(new URL('../data/raw/osm-signals.json', import.meta.url), 'utf8')).elements;
const ctl = new Map(); let lastD = -1e9, acc = 0;
for (let i = 0; i < path.length; i++) {
  if (i) acc += haversine(path[i - 1], path[i]);
  if (/motorway/.test(path[i].cls)) continue;
  const s = sigs.find((n) => haversine(n, path[i]) < 18); if (!s || acc - lastD < 60) continue;
  ctl.set(i, s.tags.highway === 'stop' ? 'stop' : 'signal'); lastD = acc;
}
const routeOut = { name: 'Simulated route', note: 'Computed shortest-time road route on OpenStreetMap data with our own router. Not a recorded drive.', attribution: map.attribution, osmBase: osm.osm3s?.timestamp_osm_base, start: START, property: PROPERTY, lengthM: Math.round(total), roads: names, points: path.map((p, i) => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), cls: p.cls, v: SPEED[p.cls], ...(ctl.has(i) ? { ctl: ctl.get(i) } : {}) })) };
fs.writeFileSync(new URL('../data/route.json', import.meta.url), JSON.stringify(routeOut));
fs.writeFileSync(new URL('../data/map.json', import.meta.url), JSON.stringify(map));
console.log('controls on route', JSON.stringify([...ctl.entries()]));
console.log('route', Math.round(total), 'm', path.length, 'pts via', names.join(' > '));
console.log('map bytes', JSON.stringify(map).length, Object.fromEntries(Object.entries(map.layers).map(([k, v]) => [k, v.length])));
