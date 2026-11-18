import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { CmsStore, validateItem } from '../cms/store.js';
import { activeRotation } from '../lib/rotation.js';

test('seed, edit, publish a playlist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-')); const s = new CmsStore(path.join(dir, 'c.sqlite'));
  assert.equal(s.seedIfEmpty(), true); assert.equal(s.seedIfEmpty(), false);
  s.updateClient('sample-cafe', { name: 'Sample Café B', accent: '#112233' });
  const id = s.upsertItem('sample-cafe', { kind: 'ad', title: 'Test ad', duration_s: 6, weight: 2 });
  const pl = s.publish('sample-cafe', dir);
  assert.equal(pl.client.name, 'Sample Café B'); assert.equal(pl.version, 1); assert.ok(pl.items.some((i) => i.id === id && i.weight === 2));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'sample-cafe.json'))), pl);
  s.deleteItem('sample-cafe', id); assert.ok(!s.publish('sample-cafe').items.some((i) => i.id === id));
});
test('validation rejects bad input', () => {
  assert.throws(() => validateItem({ kind: 'popup', title: 'x' })); assert.throws(() => validateItem({ kind: 'ad', title: '' }));
  assert.throws(() => validateItem({ kind: 'ad', title: 'x', start_hhmm: '18:00', end_hhmm: '09:00' })); assert.throws(() => validateItem({ kind: 'ad', title: 'x', image: 'http://evil' }));
});
test('rotation respects time windows (property local time) and weights', () => {
  const pl = { items: [{ id: 1, window: ['00:00', '24:00'], days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], weight: 2 }, { id: 2, window: ['15:00', '18:00'], days: ['wed'], weight: 1 }] };
  const wed4pmChicago = new Date('2026-11-18T22:00:00Z'); const wed9pm = new Date('2026-11-19T03:00:00Z');
  assert.deepEqual(activeRotation(pl, wed4pmChicago, 'America/Chicago').map((i) => i.id), [1, 1, 2]);
  assert.deepEqual(activeRotation(pl, wed9pm, 'America/Chicago').map((i) => i.id), [1, 1]);
});
