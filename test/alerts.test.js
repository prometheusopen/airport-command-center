import test from 'node:test';
import assert from 'node:assert/strict';
import { shuttleArriving, arrivalWave, faaDelay, weatherAlert } from '../lib/alerts.js';
test('alert texts fit one GSM-7 SMS segment and say they are estimates', () => {
  const all = [shuttleArriving({ van: 'Van 1', property: 'Sample Hotel', etaS: 61 }), shuttleArriving({ etaS: 20 }), arrivalWave({ start: '1:30', end: '2:00 AM', flights: 7, guests: 28, curbFrom: '1:55 AM' }), faaDelay({ airport: 'ORD', kind: 'Ground delay', avgMin: 52, weather: true }), weatherAlert({ event: 'Wind Advisory', ends: '6 PM' })];
  for (const m of all) { assert.ok(m.chars <= 160, m.text); assert.equal(m.gsm7, true, m.text); assert.match(m.delivery, /not connected/); }
  assert.match(all[0].text, /in about 1 min \(GPS estimate\)/); assert.match(all[1].text, /arriving at the hotel front entrance now/); assert.match(all[2].text, /estimate/);
});
