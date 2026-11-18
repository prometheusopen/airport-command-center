import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFaa, parseObs, parseMetar, parseTaf } from '../lib/feeds.js';
const fx = (n) => fs.readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');

test('FAA: real capture with no ORD programs', () => {
  const s = parseFaa(fx('faa.xml'), 'ORD');
  assert.equal(s.arrivalDelayMin, 0); assert.equal(s.groundStop, false); assert.match(s.updated, /2026/);
  const m = parseFaa(fx('faa.xml'), 'MIA'); assert.equal(m.programs[0].kind, 'Departure delay'); assert.equal(m.programs[0].avgMin, 23);
});
test('FAA: ground delay program + departure delay at ORD', () => {
  const s = parseFaa(fx('faa-ord-gdp.xml'), 'ORD');
  const gd = s.programs.find((p) => p.kind === 'Ground delay');
  assert.equal(gd.avgMin, 52); assert.equal(gd.maxMin, 101); assert.equal(gd.weather, true);
  assert.equal(s.arrivalDelayMin, 52); assert.equal(s.weatherDelay, true);
  assert.equal(s.programs.find((p) => p.kind === 'Departure delay').affects, 'departures');
});
test('NWS observation parse (real capture)', () => { const o = parseObs(JSON.parse(fx('obs.json'))); assert.equal(o.station, 'KORD'); assert.equal(o.tempF, 45); assert.equal(o.icon, 'clear-night'); assert.equal(typeof o.windMph, 'number'); });
test('METAR / TAF parse (real capture)', () => { const m = parseMetar(JSON.parse(fx('metar.json'))); assert.match(m.raw, /^METAR KORD/); assert.equal(m.fltCat, 'VFR'); assert.equal(m.ceilingFt, null); assert.match(parseTaf(JSON.parse(fx('taf.json'))).raw, /^TAF KORD/); });
