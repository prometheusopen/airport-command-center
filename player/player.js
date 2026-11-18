// Airport Command Center lobby / restaurant screen player. Apache-2.0. No dependencies.
// Same file runs on our local server (mode 'server': live Traccar via SSE) and on the website
// (mode 'static': same-origin FAA/NWS function, Traccar session export replayed in the browser).
import { EtaEngine, formatEta } from './lib/eta.js';
import { forecastWave } from './lib/wave.js';
import { sampleArrivals, sampleDepartures } from './lib/samples.js';
import { activeRotation } from './lib/rotation.js';
import { projector, cumulative, pointAt, bearing } from './lib/geo.js';
import { weatherIcon, adArt, monogram, roomArt } from './art.js';

const TZ = 'America/Chicago'; const TZL = 'CT';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtT = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(ms);
const fmtHM = (ms) => fmtT(ms).replace(/\s?[AP]M$/, '');
const ampm = (ms) => (fmtT(ms).match(/[AP]M$/) || [''])[0];
const fmtDate = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(ms);
const STATUS = { 'On time': ['ok', '✓'], Delayed: ['delay', '▲'], Boarding: ['board', '●'], 'Final call': ['final', '◆'], Landed: ['landed', '↓'], Cancelled: ['cancel', '✕'], Departed: ['landed', '↗'] };
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export async function mountPlayer(root, cfg) {
  const P = new Player(root, cfg); await P.init(); return P;
}

class Player {
  constructor(root, cfg) {
    this.root = root; this.cfg = cfg; this.scene = cfg.scene || 'lobby'; this.gps = cfg.gps ?? true; this.theme = 'dark';
    this.chime = false; this.paused = false; this.rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.status = null; this.playlists = {}; this.timers = []; this.rows = new Map();
  }
  async init() {
    this.buildDom();
    const [route, map] = await Promise.all([this.json(this.cfg.routeUrl), this.json(this.cfg.mapUrl)]);
    this.route = route; this.map = map; this.drawMap();
    for (const id of ['sample-hotel', 'sample-cafe']) this.playlists[id] = await this.json(this.cfg.playlistUrl(id)).catch(() => null);
    this.applyClient();
    this.refreshStatus(); this.every(this.cfg.statusEveryMs || 120e3, () => this.refreshStatus());
    this.every(1000, () => this.tick());
    this.startShuttle();
    this.startAds();
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { this.rm = e.matches; this.root.classList.toggle('rm', this.rm); });
    this.root.classList.toggle('rm', this.rm);
    this.tick(true);
  }
  json(u) { return fetch(u, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); }); }
  every(ms, fn) { this.timers.push(setInterval(() => { if (!this.paused) fn(); }, ms)); }

  // ---------- DOM
  buildDom() {
    const r = this.root; r.classList.add('acc'); r.dataset.scene = this.scene; r.dataset.theme = this.theme; r.dataset.gps = this.gps ? 'on' : 'off';
    r.innerHTML = `
      <div class="acc-bar" role="group" aria-label="Lobby screen controls">
        <div class="acc-seg" role="group" aria-label="Scene">
          <button type="button" class="acc-btn" data-scene-btn="lobby" aria-pressed="true">Hotel lobby</button>
          <button type="button" class="acc-btn" data-scene-btn="restaurant" aria-pressed="false">Airport restaurant</button>
        </div>
        <button type="button" class="acc-btn acc-gps" aria-pressed="true">Shuttle GPS: on</button>
        <button type="button" class="acc-btn acc-theme" aria-pressed="false">Light theme</button>
        <button type="button" class="acc-btn acc-chime" aria-pressed="false">Chime: off</button>
        <button type="button" class="acc-btn acc-pause" aria-pressed="false">Pause motion</button>
        <button type="button" class="acc-btn acc-fs">Fullscreen</button>
      </div>
      <p class="acc-honest"><strong>Rendering, simulated data.</strong> Weather and FAA delay status are live. Flight rows are sample data with fictional airlines. The van follows a simulated route replayed through our Traccar server.</p>
      <div class="acc-room"><div class="acc-room-art"></div>
        <div class="acc-tv"><div class="acc-bezel"><div class="acc-wrap"><div class="scr" role="region" aria-label="Screen preview">
          <header class="scr-head">
            <div class="scr-brand"><span class="scr-logo"></span><span><b class="scr-name"></b><span class="scr-tag"></span></span></div>
            <div class="scr-title"><span class="scr-kicker">ORD · Demo airport</span><b class="scr-h"></b></div>
            <div class="scr-clock"><b class="clk"><span class="clk-hm"></span><span class="clk-ap"></span></b><span class="clk-date"></span></div>
          </header>
          <div class="scr-wx"></div>
          <main class="scr-main">
            <section class="pane pane-board"><div class="board-h"></div><div class="board" role="table"></div><p class="tag-sample">Sample data · fictional airlines</p></section>
            <section class="pane pane-map"><div class="map"></div><p class="tag-sim">Simulated route</p><p class="map-attr"></p><p class="map-rate"></p></section>
            <aside class="pane pane-side">
              <div class="eta-card"></div>
              <div class="fc"></div>
              <div class="ad"><div class="ad-stage"></div></div>
            </aside>
            <section class="pane pane-adfull"><div class="ad-stage"></div></section>
          </main>
          <footer class="scr-tick"><p class="scr-honest">Rendering, simulated data</p><div class="tick-win"><div class="tick-track"></div></div></footer>
          <div class="take" aria-hidden="true"><div class="take-in"></div></div>
        </div></div></div></div>
      </div>
      <p class="acc-live" role="status" aria-live="polite"></p>`;
    this.$ = (s) => r.querySelector(s);
    this.screen = this.$('.scr'); this.wrap = this.$('.acc-wrap');
    const fit = () => { const w = this.wrap.clientWidth || 640; this.screen.style.transform = `scale(${w / 1920})`; this.wrap.style.height = `${(w / 1920) * 1080}px`; };
    new ResizeObserver(fit).observe(this.wrap); fit();
    r.querySelectorAll('[data-scene-btn]').forEach((b) => b.addEventListener('click', () => this.setScene(b.dataset.sceneBtn)));
    this.$('.acc-gps').addEventListener('click', () => this.setGps(!this.gps));
    this.$('.acc-theme').addEventListener('click', () => { this.theme = this.theme === 'dark' ? 'light' : 'dark'; r.dataset.theme = this.theme; this.$('.acc-theme').setAttribute('aria-pressed', this.theme === 'light'); });
    this.$('.acc-chime').addEventListener('click', () => { this.chime = !this.chime; const b = this.$('.acc-chime'); b.setAttribute('aria-pressed', this.chime); b.textContent = `Chime: ${this.chime ? 'on' : 'off'}`; if (this.chime) this.playChime(true); });
    this.$('.acc-pause').addEventListener('click', () => this.setPaused(!this.paused));
    this.$('.acc-fs').addEventListener('click', () => { const tv = this.$('.acc-tv'); if (document.fullscreenElement) document.exitFullscreen(); else tv.requestFullscreen?.().catch(() => {}); });
    document.addEventListener('fullscreenchange', fit);
    this.$('.acc-room-art').innerHTML = roomArt(this.scene);
    this.renderScene();
  }
  setScene(s) {
    this.scene = s; this.root.dataset.scene = s; this.root.querySelectorAll('[data-scene-btn]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sceneBtn === s));
    this.$('.acc-room-art').innerHTML = roomArt(s); this.$('.acc-gps').hidden = s !== 'lobby';
    this.rows.clear(); this.$('.board').innerHTML = ''; this.applyClient(); this.renderScene(); this.adIdx = -1; this.nextAd(true); this.tick(true);
  }
  setGps(on) { this.gps = on; this.root.dataset.gps = on ? 'on' : 'off'; const b = this.$('.acc-gps'); b.setAttribute('aria-pressed', on); b.textContent = `Shuttle GPS: ${on ? 'on' : 'off'}`; if (!on) this.hideTakeover(); this.renderScene(); this.tick(true); }
  setPaused(p) { this.paused = p; this.root.classList.toggle('paused', p); const b = this.$('.acc-pause'); b.setAttribute('aria-pressed', p); b.textContent = p ? 'Resume motion' : 'Pause motion'; if (!p) this.lastFrame = performance.now(); }
  renderScene() {
    const lobby = this.scene === 'lobby';
    this.$('.scr-h').textContent = lobby ? (this.gps ? 'Shuttle & arrivals' : 'Arrivals') : 'Departures';
    this.$('.pane-map').hidden = !(lobby && this.gps); this.$('.eta-card').hidden = !(lobby && this.gps);
    this.$('.pane-side').hidden = !lobby; this.$('.pane-adfull').hidden = lobby; this.$('.fc').hidden = !lobby;
    this.screen.dataset.layout = lobby ? (this.gps ? 'gps' : 'board') : 'restaurant';
    const cols = lobby ? ['Time', 'Flight', 'From', 'Status'] : ['Time', 'Flight', 'To', 'Gate', 'Boarding', 'Status'];
    if (lobby && !this.gps) cols.splice(3, 0, 'Gate');
    this.cols = cols;
    this.$('.board-h').innerHTML = `<div class="row row-h" role="row">${cols.map((c) => `<span role="columnheader" class="c c-${c.toLowerCase()}">${c}</span>`).join('')}</div>`;
    this.rows.clear(); this.$('.board').innerHTML = '';
  }
  client() { return this.playlists[this.scene === 'lobby' ? 'sample-hotel' : 'sample-cafe']; }
  applyClient() {
    const pl = this.client(); if (!pl) return; const c = pl.client;
    this.$('.scr-logo').innerHTML = monogram(c.monogram, c.accent); this.$('.scr-name').textContent = c.name; this.$('.scr-tag').textContent = c.tagline || '';
    this.screen.style.setProperty('--accent', c.accent);
  }

  // ---------- live status (FAA + NWS + METAR/TAF)
  async refreshStatus() {
    try { this.status = await this.json(this.cfg.statusUrl); this.statusErr = null; } catch (e) { this.statusErr = String(e.message || e); }
    this.renderWx(); this.renderTicker();
  }
  renderWx() {
    const el = this.$('.scr-wx'); const s = this.status;
    if (!s) { el.innerHTML = `<span class="wx-none">Live weather and FAA status unavailable right now${this.statusErr ? '' : ' (loading)'}</span>`; return; }
    const w = s.weather; const m = s.metar; const faa = s.faa;
    const progs = (faa?.programs || []).filter((p) => p.affects !== 'notice');
    const faaTxt = !faa ? 'FAA status unavailable' : progs.length ? progs.map((p) => `${p.kind}${p.avgMin ? ` · avg ${p.avgMin} min` : ''}${p.weather ? ' (weather)' : ''}`).join(' · ') : 'No FAA delay programs';
    const faaCls = !faa ? 'na' : progs.length ? (progs.some((p) => p.kind === 'Ground stop') ? 'cancel' : 'delay') : 'ok';
    const key = JSON.stringify([w?.time, w?.icon, w?.tempF, faaTxt, m?.raw]);
    if (key === this.wxKey) return; this.wxKey = key;
    el.innerHTML = `
      <div class="wx-now">${w ? weatherIcon(w.icon) : ''}<b class="wx-t">${w?.tempF ?? '–'}°</b><span class="wx-d">${esc(w?.text || '')}<small>${w?.windMph != null ? `Wind ${w.windMph} mph` : ''}${w?.visMi != null ? ` · Vis ${w.visMi} mi` : ''}</small></span></div>
      <div class="wx-cat"><span class="fc-cat cat-${(m?.fltCat || 'na').toLowerCase()}">${esc(m?.fltCat || '—')}</span><small>Flight category</small></div>
      <div class="wx-faa"><span class="chip chip-${faaCls}">${esc(faaTxt)}</span></div>
      <div class="wx-src"><span class="live-dot" aria-hidden="true"></span>Live · NWS ${w ? fmtT(Date.parse(w.time)) : '–'} · FAA ${faa?.updated ? fmtT(Date.parse(faa.updated)) : '–'} ${TZL}</div>`;
  }
  renderTicker() {
    const s = this.status; const pl = this.client(); const parts = [];
    if (s?.metar?.raw) parts.push(`Live METAR ${s.metar.raw}`);
    if (s?.taf?.raw) parts.push(`Live ${s.taf.raw.slice(0, 120)}…`);
    (s?.alerts || []).forEach((a) => parts.push(`NWS ${a.event}`));
    if (pl?.client?.tagline) parts.push(pl.client.tagline);
    parts.push('Flight rows: sample data, fictional airlines', 'Rendering, simulated data');
    const txt = parts.map(esc).join('<i aria-hidden="true">◆</i>');
    const tr = this.$('.tick-track'); if (tr.dataset.k === txt) return; tr.dataset.k = txt;
    tr.innerHTML = `<span>${txt}</span><span aria-hidden="true">${txt}</span>`;
  }

  // ---------- once a second
  tick(force) {
    const now = Date.now();
    const hm = fmtHM(now); const c = this.$('.clk-hm');
    if (c.dataset.v !== hm) { flap(c, hm, this.rm || force); c.dataset.v = hm; }
    this.$('.clk-ap').textContent = ` ${ampm(now)} ${TZL}`; this.$('.clk-date').textContent = fmtDate(now);
    if (this.paused && !force) return;
    if (this.scene === 'lobby') { this.renderBoard(this.cfg.mode === 'server' && this.srvArr ? this.srvArr : sampleArrivals(now), 'arr', now); this.renderForecast(now); }
    else this.renderBoard(sampleDepartures(now), 'dep', now);
    if (this.cfg.mode === 'server' && (force || now - (this.srvAt || 0) > 6000)) { this.srvAt = now; this.json('/api/flights/arrivals').then((d) => { this.srvArr = d.rows; }).catch(() => {}); }
  }

  renderBoard(rows, kind, now) {
    const max = 8;
    rows = rows.filter((r) => kind === 'dep' ? r.status !== 'Departed' || r.est > now - 2 * 60e3 : r.status !== 'Landed' || r.est > now - 12 * 60e3).slice(0, max);
    const board = this.$('.board'); const seen = new Set(); const before = new Map();
    for (const [id, el] of this.rows) before.set(id, el.getBoundingClientRect().top);
    rows.forEach((f, idx) => {
      seen.add(f.id); let el = this.rows.get(f.id);
      if (!el) { el = h('div', 'row row-new'); el.setAttribute('role', 'row'); el.innerHTML = this.cols.map((c) => `<span role="cell" class="c c-${c.toLowerCase()}"></span>`).join(''); this.rows.set(f.id, el); requestAnimationFrame(() => el.classList.remove('row-new')); }
      if (board.children[idx] !== el) board.insertBefore(el, board.children[idx] || null);
      const cell = (n) => el.querySelector('.c-' + n);
      const timeTxt = f.delayMin && f.status !== 'Cancelled' ? fmtHM(f.est) : fmtHM(f.sched);
      setFlap(cell('time'), timeTxt, this.rm); cell('time').classList.toggle('late', !!f.delayMin && f.status !== 'Cancelled');
      if (cell('flight').dataset.v !== f.flight) { cell('flight').dataset.v = f.flight; cell('flight').innerHTML = `<b>${esc(f.flight)}</b><small>${esc(f.airline)}</small>`; }
      setFlap(cell(kind === 'arr' ? 'from' : 'to'), f.city, this.rm);
      if (cell('gate')) setFlap(cell('gate'), f.gate, this.rm);
      if (cell('boarding')) { const m = Math.round((f.boardAt - now) / 60e3); const close = Math.round((f.est - 10 * 60e3 - now) / 60e3); cell('boarding').textContent = f.status === 'Cancelled' ? '—' : f.status === 'Departed' ? 'Closed' : m > 0 ? `in ${m} min` : close > 0 ? `closes in ${close} min` : 'Closed'; }
      const st = f.status === 'Delayed' ? `Delayed ${f.delayMin}m` : f.status; const sc = cell('status');
      if (sc.dataset.v !== st) { const first = !sc.dataset.v; sc.dataset.v = st; const [cls, ic] = STATUS[f.status] || ['ok', '']; sc.innerHTML = `<span class="chip chip-${cls}${first || this.rm ? '' : ' pulse'}"><i aria-hidden="true">${ic}</i>${esc(st)}</span>`; }
    });
    for (const [id, el] of this.rows) if (!seen.has(id)) { this.rows.delete(id); el.classList.add('row-out'); setTimeout(() => el.remove(), this.rm ? 0 : 450); }
    // FLIP: rows that moved glide to their new place (transform only).
    if (!this.rm) for (const [id, el] of this.rows) { const b = before.get(id); if (b == null) continue; const dy = b - el.getBoundingClientRect().top; if (Math.abs(dy) > 1) { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`; requestAnimationFrame(() => { el.style.transition = ''; el.style.transform = ''; }); } }
  }

  renderForecast(now) {
    const fc = this.$('.fc'); const w = forecastWave(sampleArrivals(now), { now, faaArrivalDelayMin: this.status?.faa?.arrivalDelayMin || 0 });
    const key = `${w.windowStart}|${w.guests}|${w.flights}|${w.faaArrivalDelayMin}|${this.gps}`;
    if (fc.dataset.k === key) return; fc.dataset.k = key;
    const maxG = Math.max(1, ...w.bins.map((b) => b.guests));
    const inWin = (b) => w.windowStart && b.t >= w.windowStart && b.t < w.windowEnd;
    const head = w.guests ? `${w.heavy ? 'Heavy arrivals' : 'Next arrivals peak'} ${fmtHM(w.windowStart)}–${fmtT(w.windowEnd)}` : 'No arrivals in the next 3 hours';
    fc.innerHTML = `<p class="fc-k">Arrival forecast</p><p class="fc-h">${esc(head)}</p>
      <p class="fc-s">${w.flights} flights · ~${w.guests} guests est.${w.curbFrom ? ` · curb from ${fmtT(w.curbFrom)}` : ''}</p>
      <div class="fc-chart" aria-hidden="true">${w.bins.map((b, i) => `<span class="bar${inWin(b) ? ' hot' : ''}" style="--v:${(b.guests / maxG).toFixed(3)};--i:${i}"></span>`).join('')}</div>
      <div class="fc-axis" aria-hidden="true"><span>${fmtT(w.bins[0]?.t || now)}</span><span>+1 h</span><span>+2 h</span><span>+3 h</span></div>
      <p class="fc-m">How this is estimated: ${esc(w.method || 'seats × load factor × share staying with us')}</p>`;
  }

  // ---------- content rotation (CMS playlist)
  startAds() { this.adIdx = -1; this.nextAd(true); }
  nextAd(first) {
    clearTimeout(this.adT); const pl = this.client(); if (!pl) return;
    const rot = activeRotation(pl, new Date(), TZ); if (!rot.length) return;
    if (this.paused) { this.adT = setTimeout(() => this.nextAd(), 1000); return; }
    const restaurant = this.scene === 'restaurant';
    if (restaurant && !first && !this.inBreak) { this.inBreak = true; this.screen.classList.add('adbreak'); }
    else if (restaurant && this.inBreak && this.breakLeft <= 0) { this.inBreak = false; this.screen.classList.remove('adbreak'); this.breakLeft = 2; this.adT = setTimeout(() => this.nextAd(), 16000); return; }
    if (restaurant && first) { this.inBreak = false; this.screen.classList.remove('adbreak'); this.breakLeft = 2; }
    this.adIdx = (this.adIdx + 1) % rot.length; const it = rot[this.adIdx];
    const stage = this.$(restaurant ? '.pane-adfull .ad-stage' : '.pane-side .ad-stage');
    const slide = h('div', 'slide', `<div class="kb">${adArt(it.image, pl.client.accent)}</div><div class="slide-txt"><span class="slide-k">${esc({ special: 'Special', ad: 'Featured', menu: 'Menu', notice: 'Guest info' }[it.kind])}</span><b>${esc(it.title)}</b><span>${esc(it.body || '')}</span>${it.price ? `<em>${esc(it.price)}</em>` : ''}<small>Sample content · ${esc(pl.client.name)}</small></div>`);
    stage.appendChild(slide); requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('on')));
    [...stage.children].slice(0, -1).forEach((o) => { o.classList.remove('on'); setTimeout(() => o.remove(), 1200); });
    if (restaurant && this.inBreak) this.breakLeft--;
    const dur = restaurant && first ? 16000 : it.durationS * 1000;
    this.adT = setTimeout(() => this.nextAd(), dur);
  }

  // ---------- map
  drawMap() {
    const m = this.map; const proj = projector(m.origin); const pts = this.route.points.map((p) => proj.fwd(p));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y); const pad = 320; const ASPECT = 1.33; // map pane is ~1000x750 px
    let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    if ((x1 - x0) / (y1 - y0) > ASPECT) { const c = (y0 + y1) / 2, hh = (x1 - x0) / ASPECT / 2; y0 = c - hh; y1 = c + hh; } else { const c = (x0 + x1) / 2, hw = (y1 - y0) * ASPECT / 2; x0 = c - hw; x1 = c + hw; }
    this.proj = proj; const W = x1 - x0, H = y1 - y0; this.vb = { x0, y1, W, H };
    const P = (x, y) => `${(x - x0).toFixed(0)},${(y1 - y).toFixed(0)}`;
    const line = (arr) => arr.map(([x, y]) => P(x, y)).join(' ');
    const L = m.layers; const lay = (k, cls) => (L[k] || []).map((a) => `<polyline class="${cls}" points="${line(a)}"/>`).join('');
    const rpath = 'M' + pts.map((p) => P(p.x, p.y)).join('L');
    const prop = proj.fwd(this.route.property); const start = proj.fwd(this.route.start);
    this.$('.map').innerHTML = `<svg class="map-svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="100%" height="100%" class="m-bg"/>
      <g class="m-air">${lay('taxiway', 'm-taxi')}${(L.terminal || []).map((a) => `<polygon class="m-term" points="${line(a)}"/>`).join('')}${lay('runway', 'm-rwy')}</g>
      ${lay('river', 'm-river')}${lay('minor', 'm-minor')}${lay('major', 'm-major')}${lay('motorway', 'm-mwy')}
      <path class="m-route" d="${rpath}"/><path class="m-trail" d="${rpath}"/>
      <g class="m-geo" transform="translate(${P(prop.x, prop.y)})"><circle r="300" class="m-fence"/><g class="m-hotel"><rect x="-34" y="-34" width="68" height="68" rx="16"/><text y="14" text-anchor="middle">H</text></g></g>
      <g transform="translate(${P(start.x, start.y)})" class="m-start"><circle r="26"/><text y="10" text-anchor="middle">✈</text></g>
      <g class="m-van"><circle class="m-pulse" r="70"/><circle class="m-dot" r="34"/><path class="m-arrow" d="M0 -26 L16 14 L0 6 L-16 14z"/></g>
    </svg>`;
    this.trail = this.$('.m-trail'); this.van = this.$('.m-van'); this.trailLen = this.trail.getTotalLength(); this.trail.style.strokeDasharray = `${this.trailLen} ${this.trailLen}`; this.trail.style.strokeDashoffset = this.trailLen;
    this.routeCum = cumulative(this.route.points); this.routeLen = this.routeCum[this.routeCum.length - 1];
    this.$('.map-attr').textContent = '© OpenStreetMap contributors (ODbL)';
  }
  placeVan(lat, lon, brg, along) {
    const q = this.proj.fwd({ lat, lon }); const { x0, y1 } = this.vb;
    this.van.setAttribute('transform', `translate(${(q.x - x0).toFixed(1)} ${(y1 - q.y).toFixed(1)})`); this.van.querySelector('.m-arrow').setAttribute('transform', `rotate(${Math.round(brg)})`);
    this.trail.style.strokeDashoffset = (this.trailLen * (1 - Math.min(1, along / this.routeLen))).toFixed(1);
  }

  // ---------- shuttle
  startShuttle() {
    this.engine = new EtaEngine({ route: this.route.points, property: this.route.property });
    if (this.cfg.mode === 'server') return this.startLive();
    return this.startReplay();
  }
  async startReplay() {
    // Website: replay the position log exported from our Traccar server, through the same ETA engine.
    this.session = await this.json(this.cfg.sessionUrl); const ps = this.session.positions;
    const FAST = this.cfg.replayRate || 8; let simT = 0, i = 0, rate = FAST, endHold = 0; let last = performance.now(); this.lastFrame = last;
    const reset = () => { simT = 0; i = 0; rate = FAST; endHold = 0; this.engine.reset(); this.etaState = null; this.hideTakeover(); };
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.25, (now - this.lastFrame) / 1000); this.lastFrame = now; if (this.paused) return;
      if (endHold > 0) { endHold -= dt; if (endHold <= 0) reset(); return; }
      simT += dt * rate;
      while (i < ps.length && ps[i].t <= simT) {
        const p = ps[i++]; const r = this.engine.update({ lat: p.lat, lon: p.lon, speed: p.speedKn * 0.514444, time: p.t * 1000 });
        this.etaState = { ...r, simT: p.t }; this.onEta(r);
        for (const ev of r.events) { if (ev.type === 'arriving') { rate = 1; this.showTakeover(); } if (ev.type === 'arrived') { this.showArrived(); endHold = 9; } }
      }
      if (i >= ps.length && endHold <= 0) endHold = 9;
      // Interpolate between logged fixes for a smooth glide (display only; ETA uses the fixes).
      const a = ps[Math.max(0, i - 1)], b = ps[Math.min(ps.length - 1, i)];
      const k = this.rm ? 0 : Math.max(0, Math.min(1, (simT - a.t) / ((b.t - a.t) || 1)));
      const lat = a.lat + (b.lat - a.lat) * k, lon = a.lon + (b.lon - a.lon) * k;
      const along = this.etaState ? this.etaState.along : 0;
      if (this.scene === 'lobby' && this.gps) this.placeVan(lat, lon, b.course ?? bearing(a, b), along);
      this.$('.map-rate').textContent = rate > 1 ? `Replay ${rate}× speed` : 'Replay at real time';
      if (this.takeover && this.etaState) this.updateTakeover(Math.max(0, this.etaState.etaS - (simT - this.etaState.simT)));
    };
    requestAnimationFrame(frame);
  }
  startLive() {
    // Local product: Server-Sent Events from our server, which listens to Traccar's WebSocket.
    const es = new EventSource(this.cfg.streamUrl); let prev = null, cur = null, t0 = 0;
    es.onmessage = (m) => { const s = JSON.parse(m.data); if (s.status !== 'live') { this.$('.map-rate').textContent = 'Waiting for the van (Traccar)'; return; }
      prev = cur; cur = s; t0 = performance.now(); this.etaState = { ...s.eta, at: performance.now() }; this.onEta(s.eta);
      for (const ev of s.eta.events || []) { if (ev.type === 'arriving') this.showTakeover(); if (ev.type === 'arrived') { this.showArrived(); setTimeout(() => this.hideTakeover(), 9000); } } };
    const frame = (now) => { requestAnimationFrame(frame); if (this.paused || !cur) return;
      const span = prev ? Math.max(500, cur.fix.time - prev.fix.time) : 1; const k = !prev || this.rm ? 1 : Math.min(1, (now - t0) / span);
      const a = prev ? prev.fix : cur.fix, b = cur.fix; if (this.scene === 'lobby' && this.gps) this.placeVan(a.lat + (b.lat - a.lat) * k, a.lon + (b.lon - a.lon) * k, b.bearing ?? 0, cur.eta.along);
      this.$('.map-rate').textContent = `Live from Traccar · fix ${fmtT(b.time)}`;
      if (this.takeover) this.updateTakeover(Math.max(0, cur.eta.etaS - (now - this.etaState.at) / 1000)); };
    requestAnimationFrame(frame);
  }
  onEta(r) {
    const card = this.$('.eta-card'); const pct = Math.min(1, r.along / r.totalM);
    const mi = (r.remainingM / 1609.34).toFixed(1); const mph = Math.round((r.speedSmooth || 0) * 2.237);
    const txt = r.etaS < 45 ? 'Arriving now' : `Arriving in ${formatEta(r.etaS).replace('about ', 'about ')}`;
    if (!card.firstChild) card.innerHTML = `<p class="eta-k">Hotel shuttle · Van 1</p><p class="eta-v"></p><p class="eta-l">Estimated from GPS distance and speed</p><div class="eta-bar"><span></span></div><p class="eta-m"></p>`;
    const v = card.querySelector('.eta-v'); if (v.textContent !== txt) v.textContent = txt;
    card.querySelector('.eta-bar span').style.transform = `scaleX(${pct.toFixed(3)})`;
    card.querySelector('.eta-m').textContent = `${mi} mi to go · ${mph} mph${r.inGeofence ? ' · inside arrival zone' : ''}`;
  }
  showTakeover() {
    if (!(this.scene === 'lobby' && this.gps)) return;
    this.takeover = true; const t = this.$('.take'); const C = 2 * Math.PI * 150;
    t.querySelector('.take-in').innerHTML = `<p class="take-k">Hotel shuttle</p><p class="take-h">Your shuttle is arriving in 1 minute</p>
      <div class="ring"><svg viewBox="0 0 340 340" aria-hidden="true" focusable="false"><circle cx="170" cy="170" r="150" class="ring-bg"/><circle cx="170" cy="170" r="150" class="ring-fg" style="stroke-dasharray:${C};stroke-dashoffset:0"/></svg><b class="ring-n">60</b><span class="ring-u">seconds (est.)</span></div>
      <p class="take-s">Please make your way to the front entrance.</p><p class="take-e">Estimated from GPS · Rendering, simulated data</p>`;
    t.classList.add('on'); this.$('.acc-live').textContent = 'Shuttle alert shown on screen: Your shuttle is arriving in 1 minute.';
    if (this.chime) this.playChime();
  }
  updateTakeover(s) {
    const n = this.$('.ring-n'); if (!n) return; const v = String(Math.ceil(Math.min(60, s))); if (n.textContent !== v) { n.textContent = v; const C = 2 * Math.PI * 150; this.$('.ring-fg').style.strokeDashoffset = (C * (1 - Math.min(60, s) / 60)).toFixed(1); }
  }
  showArrived() {
    const t = this.$('.take'); if (!this.takeover) this.showTakeover(); if (!this.takeover) return;
    t.querySelector('.take-h').textContent = 'Your shuttle is here'; t.querySelector('.ring-n').textContent = '0'; this.$('.ring-fg').style.strokeDashoffset = (2 * Math.PI * 150).toFixed(1);
    this.$('.acc-live').textContent = 'Shuttle alert: Your shuttle is here.';
  }
  hideTakeover() { this.takeover = false; this.$('.take')?.classList.remove('on'); }
  playChime(preview) {
    try { const ac = this.ac || (this.ac = new AudioContext()); const t = ac.currentTime + 0.02;
      [[659.25, 0], [880, 0.28]].forEach(([f, d]) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(preview ? 0.08 : 0.15, t + d + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9); o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + 1); });
    } catch {}
  }
}

// Split-flap text: changed characters flip in (transform + opacity only).
function flap(el, text, instant) {
  const old = el.dataset.v || '';
  el.innerHTML = `<span class="sr">${esc(text)}</span>` + [...text].map((ch, i) => `<span class="fl${!instant && ch !== old[i] ? ' flip' : ''}" style="--d:${i * 45}ms" aria-hidden="true">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
}
function setFlap(el, text, instant) { if (!el || el.dataset.v === text) return; const first = el.dataset.v == null; flap(el, text, instant || first); el.dataset.v = text; }
