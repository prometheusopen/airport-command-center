// Minimal Traccar REST/WebSocket client (session cookie auth) for our local server.
export class Traccar {
  constructor({ url, email, password }) { Object.assign(this, { url, email, password, cookie: null }); }
  async login() {
    const r = await fetch(this.url + '/api/session', { method: 'POST', body: new URLSearchParams({ email: this.email, password: this.password }) });
    if (!r.ok) throw new Error('traccar login ' + r.status);
    this.cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  }
  async get(path) {
    if (!this.cookie) await this.login();
    let r = await fetch(this.url + path, { headers: { cookie: this.cookie, accept: 'application/json' } });
    if (r.status === 401) { await this.login(); r = await fetch(this.url + path, { headers: { cookie: this.cookie, accept: 'application/json' } }); }
    if (!r.ok) throw new Error(`traccar ${path} ${r.status}`);
    return r.json();
  }
  devices() { return this.get('/api/devices'); }
  latest() { return this.get('/api/positions'); }
  history(deviceId, from, to) { return this.get(`/api/positions?deviceId=${deviceId}&from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}`); }
  // Live push: Traccar's /api/socket sends {positions:[...]} as they arrive.
  async socket(onPositions) {
    if (!this.cookie) await this.login();
    const ws = new WebSocket(this.url.replace(/^http/, 'ws') + '/api/socket', { headers: { cookie: this.cookie } });
    ws.onmessage = (m) => { try { const d = JSON.parse(m.data); if (d.positions) onPositions(d.positions); } catch {} };
    return ws;
  }
}
// Traccar positions carry speed in knots.
export const toFix = (p) => ({ lat: p.latitude, lon: p.longitude, speed: p.speed * 0.514444, bearing: p.course, time: Date.parse(p.fixTime), deviceId: p.deviceId });
