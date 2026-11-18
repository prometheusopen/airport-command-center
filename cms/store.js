// Minimal content manager store: SQLite via node:sqlite (built into Node 22.5+/24). Apache-2.0.
// Clients own branding and content items; publish() writes a versioned playlist JSON that the
// player reads. All seeded content is fictional (no real brands).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT, scene TEXT NOT NULL, accent TEXT NOT NULL DEFAULT '#f2b33d', theme TEXT NOT NULL DEFAULT 'dark', monogram TEXT, version INTEGER NOT NULL DEFAULT 0, published_at TEXT);
CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('special','ad','menu','notice')), title TEXT NOT NULL, body TEXT, price TEXT, image TEXT, duration_s INTEGER NOT NULL DEFAULT 8, start_hhmm TEXT NOT NULL DEFAULT '00:00', end_hhmm TEXT NOT NULL DEFAULT '24:00', days TEXT NOT NULL DEFAULT 'mon,tue,wed,thu,fri,sat,sun', weight INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
`;
const IMAGES = ['breakfast', 'coffee', 'bowl', 'cocktail', 'pastry', 'room'];
export const KINDS = ['special', 'ad', 'menu', 'notice'];
const HHMM = /^([01]\d|2[0-4]):[0-5]\d$/;

export class CmsStore {
  constructor(file) { this.db = new DatabaseSync(file); this.db.exec('PRAGMA foreign_keys = ON;' + SCHEMA); }
  seedIfEmpty() {
    if (this.db.prepare('SELECT COUNT(*) n FROM clients').get().n) return false;
    const c = this.db.prepare('INSERT INTO clients (id,name,tagline,scene,accent,theme,monogram) VALUES (?,?,?,?,?,?,?)');
    c.run('sample-hotel', 'Sample Hotel', 'Airport shuttle every 20 minutes', 'lobby', '#f2b33d', 'dark', 'SH');
    c.run('sample-cafe', 'Sample Café', 'Gate-side kitchen · Concourse B', 'restaurant', '#5ec4b6', 'dark', 'SC');
    const i = this.db.prepare('INSERT INTO items (client_id,kind,title,body,price,image,duration_s,start_hhmm,end_hhmm,sort) VALUES (?,?,?,?,?,?,?,?,?,?)');
    i.run('sample-hotel', 'special', 'Late check-in? Grab a hot plate', 'Kitchen open until midnight. Ask the front desk.', '$14', 'bowl', 8, '17:00', '24:00', 1);
    i.run('sample-hotel', 'ad', 'Morning coffee bar', 'Fresh espresso drinks in the lobby from 5 AM.', null, 'coffee', 8, '00:00', '24:00', 2);
    i.run('sample-hotel', 'notice', 'Shuttle to the airport', 'Every 20 minutes, 4 AM to midnight. Sign up at the desk.', null, 'room', 8, '00:00', '24:00', 3);
    i.run('sample-hotel', 'special', 'Breakfast to go', 'Ready in 5 minutes for early flights.', '$9', 'breakfast', 8, '04:00', '11:00', 4);
    i.run('sample-cafe', 'special', 'Grab-and-go breakfast', 'Egg sandwich, fruit cup and coffee.', '$8.99', 'breakfast', 8, '00:00', '24:00', 1);
    i.run('sample-cafe', 'ad', 'Coffee before you board', 'Any size drip coffee, ready in under a minute.', '$3.49', 'coffee', 8, '00:00', '24:00', 2);
    i.run('sample-cafe', 'special', 'Harvest grain bowl', 'Packed to fly. Ask for a lid and fork.', '$12.50', 'bowl', 8, '10:30', '24:00', 3);
    i.run('sample-cafe', 'ad', 'Happy hour at the bar', 'Weekdays 3–6 PM. 21+ with ID.', null, 'cocktail', 8, '15:00', '18:00', 4);
    i.run('sample-cafe', 'menu', 'Fresh pastries', 'Baked in-house every morning.', 'from $3.75', 'pastry', 8, '00:00', '24:00', 5);
    return true;
  }
  clients() { return this.db.prepare('SELECT * FROM clients ORDER BY id').all(); }
  client(id) { return this.db.prepare('SELECT * FROM clients WHERE id=?').get(id); }
  updateClient(id, b) {
    const cur = this.client(id); if (!cur) throw new Error('no such client');
    const v = { ...cur, ...pick(b, ['name', 'tagline', 'accent', 'theme', 'monogram']) };
    if (!/^#[0-9a-f]{6}$/i.test(v.accent)) throw new Error('accent must be #rrggbb');
    if (!['dark', 'light'].includes(v.theme)) throw new Error('theme must be dark or light');
    if (!v.name || v.name.length > 40) throw new Error('name 1-40 chars');
    this.db.prepare('UPDATE clients SET name=?,tagline=?,accent=?,theme=?,monogram=? WHERE id=?').run(v.name, v.tagline || '', v.accent, v.theme, (v.monogram || '').slice(0, 3), id);
    return this.client(id);
  }
  items(clientId) { return this.db.prepare('SELECT * FROM items WHERE client_id=? ORDER BY sort, id').all(clientId); }
  upsertItem(clientId, b) {
    const it = validateItem(b);
    if (b.id) { this.db.prepare('UPDATE items SET kind=?,title=?,body=?,price=?,image=?,duration_s=?,start_hhmm=?,end_hhmm=?,days=?,weight=?,enabled=?,sort=? WHERE id=? AND client_id=?').run(it.kind, it.title, it.body, it.price, it.image, it.duration_s, it.start_hhmm, it.end_hhmm, it.days, it.weight, it.enabled, it.sort, Number(b.id), clientId); return Number(b.id); }
    return Number(this.db.prepare('INSERT INTO items (client_id,kind,title,body,price,image,duration_s,start_hhmm,end_hhmm,days,weight,enabled,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(clientId, it.kind, it.title, it.body, it.price, it.image, it.duration_s, it.start_hhmm, it.end_hhmm, it.days, it.weight, it.enabled, it.sort).lastInsertRowid);
  }
  deleteItem(clientId, id) { this.db.prepare('DELETE FROM items WHERE id=? AND client_id=?').run(Number(id), clientId); }
  publish(clientId, dir) {
    const c = this.client(clientId); if (!c) throw new Error('no such client');
    const version = c.version + 1; const at = new Date().toISOString();
    this.db.prepare('UPDATE clients SET version=?, published_at=? WHERE id=?').run(version, at, clientId);
    const pl = buildPlaylist({ ...c, version, published_at: at }, this.items(clientId));
    if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/${clientId}.json`, JSON.stringify(pl, null, 1)); }
    return pl;
  }
}
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
export function validateItem(b) {
  const it = { kind: b.kind, title: String(b.title || '').trim(), body: String(b.body || '').trim(), price: b.price ? String(b.price).trim() : null, image: b.image || null, duration_s: Number(b.duration_s ?? 8), start_hhmm: b.start_hhmm || '00:00', end_hhmm: b.end_hhmm || '24:00', days: b.days || 'mon,tue,wed,thu,fri,sat,sun', weight: Number(b.weight ?? 1), enabled: b.enabled === false || b.enabled === 0 || b.enabled === '0' ? 0 : 1, sort: Number(b.sort ?? 0) };
  if (!KINDS.includes(it.kind)) throw new Error('kind must be one of ' + KINDS.join(', '));
  if (!it.title || it.title.length > 60) throw new Error('title 1-60 chars');
  if (it.body.length > 140) throw new Error('body max 140 chars');
  if (it.image && !IMAGES.includes(it.image)) throw new Error('image must be one of ' + IMAGES.join(', '));
  if (!(it.duration_s >= 4 && it.duration_s <= 30)) throw new Error('duration 4-30 s');
  if (!HHMM.test(it.start_hhmm) || !HHMM.test(it.end_hhmm) || it.start_hhmm >= it.end_hhmm) throw new Error('schedule must be HH:MM with start < end');
  if (!(it.weight >= 1 && it.weight <= 5)) throw new Error('weight 1-5');
  return it;
}
export function buildPlaylist(c, items) {
  return { schema: 'acc.playlist.v1', client: { id: c.id, name: c.name, tagline: c.tagline, accent: c.accent, theme: c.theme, monogram: c.monogram, scene: c.scene }, version: c.version, publishedAt: c.published_at, sample: true,
    items: items.filter((i) => i.enabled).map((i) => ({ id: i.id, kind: i.kind, title: i.title, body: i.body, price: i.price, image: i.image, durationS: i.duration_s, window: [i.start_hhmm, i.end_hhmm], days: i.days.split(','), weight: i.weight })) };
}
