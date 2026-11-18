// Airport Command Center lobby / restaurant screen player No dependencies.
// Same file runs on our local server (mode 'server': live Traccar via SSE) and on the website
// (mode 'static': same-origin FAA/NWS function, Traccar session export replayed in the browser).
import { EtaEngine, formatEta } from './lib/eta.js';
import { forecastWave } from './lib/wave.js';
import { sampleArrivals } from './lib/samples.js';
import { FeedChain } from './lib/flightfeed.js';
import { flightChanges, changeText, frontDeskChanges } from './lib/changes.js';
import { activeRotation } from './lib/rotation.js';
import { shuttleArriving, arrivalWave, faaDelay, weatherAlert } from './lib/alerts.js';
import { projector, cumulative, bearing } from './lib/geo.js';
import { weatherIcon, adArt, monogram, roomArt } from './art.js';

const TZ = 'America/Chicago'; const TZL = 'CT'; const MIN = 60e3;
const SKINS = [['graphite', 'Graphite'], ['steel', 'Steel blue'], ['espresso', 'Espresso'], ['caramel', 'Caramel gold']];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtT = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(ms);
const fmtHM = (ms) => fmtT(ms).replace(/\s?[AP]M$/, '');
const ampm = (ms) => (fmtT(ms).match(/[AP]M$/) || [''])[0];
const fmtDate = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(ms);
const STATUS = { 'On time': ['ok', '✓'], Early: ['early', '◀'], Scheduled: ['sched', '○'], Delayed: ['delay', '▲'], Boarding: ['board', '●'], 'Final call': ['final', '◆'], Landed: ['landed', '↓'], Cancelled: ['cancel', '✕'], Departed: ['landed', '↗'] };
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export async function mountPlayer(root, cfg) { const P = new Player(root, cfg); await P.init(); return P; }

class Player {
  constructor(root, cfg) {
    Object.assign(this, { root, cfg, scene: cfg.scene || 'lobby', gps: cfg.gps ?? true, view: 'room', skin: null, chime: false, paused: false, demoFaa: false, status: null, playlists: {}, boards: {}, alerts: [] });
    this.rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  async init() {
    this.buildDom();
    const [route, map] = await Promise.all([this.json(this.cfg.routeUrl), this.json(this.cfg.mapUrl)]);
    this.route = route; this.map = map; this.drawMap();
    for (const id of ['sample-hotel', 'sample-cafe']) this.playlists[id] = await this.json(this.cfg.playlistUrl(id)).catch(() => null);
    this.applyClient(); if (this.cfg.skin) this.setSkin(this.cfg.skin);
    await this.loadFlights(); setInterval(() => this.loadFlights(), this.cfg.flightsEveryMs || (this.cfg.flightsUrl ? 30e3 : 5e3));
    await this.refreshStatus(); setInterval(() => this.refreshStatus(), this.cfg.statusEveryMs || 120e3);
    setInterval(() => this.tick(), 1000);
    this.startShuttle(); this.startAds();
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { this.rm = e.matches; this.root.classList.toggle('rm', this.rm); });
    this.root.classList.toggle('rm', this.rm);
    if (this.cfg.kiosk) this.kiosk();
    this.tick(true);
  }
  json(u) { return fetch(u, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); }); }
  $(s) { return this.root.querySelector(s); }

  // ---------- DOM
  buildDom() {
    const r = this.root; r.classList.add('acc');
    const seg = (label, attr, items, cur) => `<div class="acc-seg" role="group" aria-label="${label}">${items.map(([k, t]) => `<button type="button" class="acc-btn" data-${attr}="${k}" aria-pressed="${k === cur}">${t}</button>`).join('')}</div>`;
    r.innerHTML = `
      <div class="acc-bar" role="group" aria-label="Lobby screen controls">
        ${seg('Scene', 'scene-btn', [['lobby', 'Hotel lobby'], ['restaurant', 'Airport restaurant']], this.scene)}
        ${seg('View', 'view-btn', [['room', 'In the room'], ['screen', 'Screen only'], ['split', 'With front-desk phone']], 'room')}
        <button type="button" class="acc-btn acc-gps" aria-pressed="true">Shuttle GPS: on</button>
        ${seg('Screen skin', 'skin-btn', SKINS, '')}
        <button type="button" class="acc-btn acc-demo" aria-pressed="false" hidden>Demo: FAA ground delay</button>
        <button type="button" class="acc-btn acc-chime" aria-pressed="false">Chime: off</button>
        <button type="button" class="acc-btn acc-pause" aria-pressed="false">Pause motion</button>
        <button type="button" class="acc-btn acc-fs">Fullscreen</button>
      </div>
      <p class="acc-honest"><strong>Rendering, simulated data.</strong> Weather and FAA delay status are live. Flight rows are sample data with fictional airlines. The van follows a simulated route replayed through our Traccar server.</p>
      <div class="acc-stage">
      <div class="acc-room"><div class="acc-room-art"></div>
        <div class="acc-tv"><div class="acc-bezel"><div class="acc-wrap"><div class="scr" role="region" aria-label="Screen preview">
          <div class="scr-head">
            <div class="scr-brand"><span class="scr-logo"></span><span><b class="scr-name"></b><span class="scr-tag"></span></span></div>
            <div class="scr-title"><span class="scr-kicker">ORD · Demo airport</span><b class="scr-h"></b></div>
            <div class="scr-right"><div class="scr-wxmini"></div><div class="scr-clock"><b class="clk"><span class="clk-hm"></span><span class="clk-ap"></span></b><span class="clk-date"></span></div></div>
          </div>
          <div class="scr-main">
            <div class="banners"></div>
            <div class="pane pane-boards"><div class="boards"></div><p class="tag-sample">Sample data · fictional airlines</p></div>
            <div class="pane pane-map"><div class="map"></div><p class="tag-sim">Simulated route</p><p class="map-attr"></p><p class="map-rate"></p></div>
            <div class="pane pane-side"><div class="fc"></div><div class="ad"><div class="ad-stage"></div></div></div>
            <div class="pane pane-adfull"><div class="ad-stage"></div></div>
          </div>
          <div class="scr-tick"><p class="scr-honest">Rendering, simulated data</p><div class="tick-win"><div class="tick-track"></div></div></div>
          <p class="scr-net" role="status" hidden></p>
          <div class="take" aria-hidden="true"><div class="take-in"></div></div>
        </div></div></div></div>
      </div>
      <div class="acc-phone" hidden><div class="ph-body"><div class="ph-notch" aria-hidden="true"></div>
        <p class="ph-h">Front desk alerts</p><p class="ph-tag">Alert preview · SMS delivery not connected in demo</p>
        <ol class="ph-list" aria-label="Front desk alert previews"></ol></div></div>
      </div>
      <p class="acc-live" role="status" aria-live="polite"></p>`;
    this.screen = this.$('.scr'); this.wrap = this.$('.acc-wrap');
    const fit = () => { const w = this.wrap.clientWidth || 640; this.screen.style.transform = `scale(${w / 1920})`; this.wrap.style.height = `${(w / 1920) * 1080}px`; };
    new ResizeObserver(fit).observe(this.wrap); fit(); document.addEventListener('fullscreenchange', fit);
    const press = (attr, v) => r.querySelectorAll(`[data-${attr}]`).forEach((b) => b.setAttribute('aria-pressed', b.dataset[attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())] === v));
    this.press = press;
    r.querySelectorAll('[data-scene-btn]').forEach((b) => b.addEventListener('click', () => this.setScene(b.dataset.sceneBtn)));
    r.querySelectorAll('[data-view-btn]').forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.viewBtn)));
    r.querySelectorAll('[data-skin-btn]').forEach((b) => b.addEventListener('click', () => this.setSkin(b.dataset.skinBtn)));
    this.$('.acc-gps').addEventListener('click', () => this.setGps(!this.gps));
    this.$('.acc-demo').addEventListener('click', () => { this.demoFaa = !this.demoFaa; this.$('.acc-demo').setAttribute('aria-pressed', this.demoFaa); this.renderStatus(); this.tick(true); });
    this.$('.acc-chime').addEventListener('click', () => { this.chime = !this.chime; const b = this.$('.acc-chime'); b.setAttribute('aria-pressed', this.chime); b.textContent = `Chime: ${this.chime ? 'on' : 'off'}`; if (this.chime) this.playChime(true); });
    this.$('.acc-pause').addEventListener('click', () => this.setPaused(!this.paused));
    this.$('.acc-fs').addEventListener('click', () => { const tv = this.$('.acc-tv'); if (document.fullscreenElement) document.exitFullscreen(); else tv.requestFullscreen?.().catch(() => {}); });
    r.dataset.view = 'room'; this.setScene(this.scene, true);
  }
  setScene(s, init) {
    this.scene = s; this.root.dataset.scene = s; this.press('scene-btn', s);
    this.$('.acc-room-art').innerHTML = roomArt(s); this.$('.acc-gps').hidden = s !== 'lobby';
    this.applyClient(); this.layout(); if (!init) { this.adIdx = -1; this.startAds(); this.tick(true); }
  }
  setView(v) {
    const tv = this.$('.acc-tv'); const a = tv.getBoundingClientRect();
    this.view = v; this.root.dataset.view = v; this.press('view-btn', v); this.$('.acc-phone').hidden = v !== 'split';
    // Zoom between the room view and the screen-only view (FLIP, transform only).
    if (!this.rm && a.width) { const b = tv.getBoundingClientRect(); const sx = a.width / b.width; tv.style.transition = 'none'; tv.style.transformOrigin = '0 0'; tv.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${sx})`; requestAnimationFrame(() => requestAnimationFrame(() => { tv.style.transition = 'transform .8s cubic-bezier(.2,.8,.2,1)'; tv.style.transform = ''; })); }
  }
  setSkin(k) { this.skin = k; this.screen.dataset.skin = k; this.root.dataset.skin = k; this.press('skin-btn', k); }
  setGps(on) { this.gps = on; const b = this.$('.acc-gps'); b.setAttribute('aria-pressed', on); b.textContent = `Shuttle GPS: ${on ? 'on' : 'off'}`; if (!on) this.hideTakeover(); this.layout(); this.adIdx = -1; this.startAds(); this.tick(true); }
  setPaused(p) { this.paused = p; this.root.classList.toggle('paused', p); const b = this.$('.acc-pause'); b.setAttribute('aria-pressed', p); b.textContent = p ? 'Resume motion' : 'Pause motion'; if (!p) this.lastFrame = performance.now(); }
  layout() {
    const lobby = this.scene === 'lobby'; const L = lobby ? (this.gps ? 'gps' : 'board') : 'restaurant';
    this.screen.dataset.layout = L; this.root.dataset.layout = L;
    this.$('.scr-h').textContent = L === 'gps' ? 'Shuttle & arrivals' : L === 'board' ? 'Departures & arrivals' : 'Departures';
    this.$('.pane-map').hidden = L !== 'gps'; this.$('.pane-side').hidden = L !== 'gps'; this.$('.pane-boards').hidden = L === 'gps';
    const boards = this.$('.boards'); this.boards = {};
    const defs = L === 'board' ? [['dep', 'Departures', ['Time', 'Destination', 'Code', 'Gate', 'Status']], ['arr', 'Arrivals', ['Time', 'Origin', 'Code', 'Gate', 'Status']]] : L === 'restaurant' ? [['dep', 'Departures', ['Time', 'Destination', 'Code', 'Gate', 'Boarding', 'Status']]] : [];
    boards.innerHTML = defs.map(([k, t, cols]) => `<div class="bd bd-${k}"><p class="bd-t">${t}</p><div class="tbl" role="table" aria-label="${t}, sample data"><div role="rowgroup"><div class="row row-h" role="row">${cols.map((c) => `<span role="columnheader" class="c c-${c.toLowerCase()}">${c}</span>`).join('')}</div></div><div class="board" role="rowgroup"></div></div></div>`).join('');
    for (const [k, , cols] of defs) this.boards[k] = { el: boards.querySelector(`.bd-${k} .board`), cols, rows: new Map() };
    this.renderStatus(); this.screen.classList.remove('adbreak'); this.$('.banners').dataset.k = '';
  }
  client() { return this.playlists[this.scene === 'lobby' ? 'sample-hotel' : 'sample-cafe']; }
  applyClient() {
    const pl = this.client(); if (!pl) return; const c = pl.client;
    this.$('.scr-logo').innerHTML = monogram(c.monogram, c.accent); this.$('.scr-name').textContent = c.name; this.$('.scr-tag').textContent = c.tagline || '';
    this.screen.style.setProperty('--accent', c.accent); this.setSkin(c.theme || 'steel');
  }

  // ---------- flights, through the FlightFeed interface (server: cached once for every screen)
  async loadFlights() {
    this.fl = this.fl || {};
    try {
      let arr, dep;
      if (this.cfg.flightsUrl) { const j = await this.json(this.cfg.flightsUrl); arr = j.arrivals; dep = j.departures; }
      else { this.chain = this.chain || new FeedChain(['sample']); const now = Date.now(); [arr, dep] = await Promise.all([this.chain.get('arrivals', 'ORD', now), this.chain.get('departures', 'ORD', now)]); }
      // Front desk cares about arriving guests: cancellations and long delays only, at most one text per 2 minutes.
      const ch = frontDeskChanges(flightChanges(this.fl.arr || [], arr.rows));
      if (this.fl.arr && ch.length && Date.now() - (this.flAlertAt || 0) > 120e3) { this.flAlertAt = Date.now(); this.pushAlert({ kind: 'flight', text: `Sample flight change: ${changeText(ch[0])}`, chars: 0 }); }
      this.fl = { arr: arr.rows, dep: dep.rows, source: arr.source, at: Date.now() }; this.netOk(true);
    } catch (e) { this.netOk(false); }
  }
  netOk(ok) {
    const now = Date.now(); if (ok) this.lastGood = now;
    const pill = this.$('.scr-net'); if (!pill) return; const down = !ok && this.lastGood;
    pill.hidden = !down; if (down) pill.textContent = `Reconnecting… showing data from ${fmtT(this.lastGood)}`;
  }
  // ---------- kiosk (LG webOS "Play via URL" and other browsers in signage mode)
  kiosk() {
    const r = this.root; r.classList.add('kiosk'); this.setView('screen');
    const fit = () => { const k = Math.min(innerWidth / 1920, innerHeight / 1080); this.wrap.style.width = `${1920 * k}px`; this.wrap.style.height = `${1080 * k}px`; this.screen.style.transform = `scale(${k})`; };
    addEventListener('resize', fit); fit();
    // Burn-in care: shift the whole picture by up to 2 px every 3 minutes (imperceptible at 10 ft).
    const shifts = [[0, 0], [2, 0], [2, 2], [0, 2], [-2, 2], [-2, 0], [-2, -2], [0, -2], [2, -2]]; let si = 0;
    setInterval(() => { si = (si + 1) % shifts.length; this.$('.acc-tv').style.transform = `translate(${shifts[si][0]}px, ${shifts[si][1]}px)`; }, 180e3);
    // Recover from network loss: refetch on 'online'; errors keep last data on screen.
    addEventListener('online', () => { this.loadFlights(); this.refreshStatus(); });
    // Reload guard: reload every 6 hours, or if the clock loop stalls, but only when the server answers
    // (so a dropped network never turns the screen into a browser error page).
    const healthy = () => fetch(this.cfg.healthUrl || location.href, { method: 'HEAD', cache: 'no-store' }).then((x) => x.ok).catch(() => false);
    const born = Date.now();
    setInterval(async () => { const stalled = Date.now() - (this.lastTick || Date.now()) > 90e3; if ((stalled || Date.now() - born > 6 * 3600e3) && (await healthy())) location.reload(); }, 60e3);
    addEventListener('error', () => { setTimeout(async () => { if (await healthy()) location.reload(); }, 60e3); });
  }

  // ---------- live status (FAA + NWS + METAR/TAF), via our own API
  async refreshStatus() {
    try { this.status = await this.json(this.cfg.statusUrl); this.statusErr = null; } catch (e) { this.statusErr = String(e.message || e); this.netOk(false); }
    this.renderStatus(); this.renderTicker();
  }
  faaPrograms() {
    const live = (this.status?.faa?.programs || []).filter((p) => p.affects !== 'notice');
    this.$('.acc-demo').hidden = live.length > 0 || !this.status?.faa;
    if (live.length) return { live: true, programs: live, arrivalDelayMin: this.status.faa.arrivalDelayMin };
    if (this.demoFaa) return { live: false, programs: [{ kind: 'Ground delay', avgMin: 45, weather: true, affects: 'arrivals' }], arrivalDelayMin: 45 };
    return { live: true, programs: [], arrivalDelayMin: 0 };
  }
  renderStatus() {
    const s = this.status; const w = s?.weather;
    this.$('.scr-wxmini').innerHTML = w ? `${weatherIcon(w.icon)}<span><b>${w.tempF ?? '–'}°F</b><small>${esc(w.text || '')}</small></span>` : '';
    this.renderBanners(Date.now());
  }
  renderBanners(now) {
    const s = this.status; const b = []; const faa = this.faaPrograms(); const L = this.screen.dataset.layout;
    const liveTag = (src) => `<span class="live"><span class="live-dot" aria-hidden="true"></span>Live · auto refresh · ${src}</span>`;
    if (faa.programs.length) { const p = faa.programs[0]; b.push(`<div class="bn bn-faa"><b>${faa.live ? '' : 'DEMO, not live: '}FAA ${esc(p.kind.toLowerCase())} at ORD</b><span>${p.avgMin ? `Average ${p.avgMin} min` : ''}${p.weather ? ' · weather' : ''} · arriving guests may be late</span>${faa.live ? liveTag(`FAA ${fmtT(Date.parse(s.sources?.[0]?.fetchedAt || s.generatedAt))}`) : '<span class="live demo">Demo toggle · sample program</span>'}</div>`); }
    if (L === 'gps' && this.etaState) b.push(this.shuttleBanner(this.etaState));
    if (L !== 'gps') {
      const w = s?.weather; const al = s?.alerts?.[0];
      const txt = !s ? 'Live weather unavailable right now' : al ? `NWS ${esc(al.event)}${al.ends ? ` until ${fmtT(Date.parse(al.ends))}` : ''}` : `${esc(w?.text || '')}, ${w?.tempF ?? '–'}°F, wind ${w?.windMph ?? '–'} mph · no active NWS alerts near the airport${s?.metar?.fltCat ? ` · ${s.metar.fltCat}` : ''}`;
      b.push(`<div class="bn bn-wx${al ? ' alert' : ''}">${w ? weatherIcon(w.icon) : ''}<b>Front desk weather notice</b><span>${txt}</span>${s ? liveTag(`NWS ${w ? fmtT(Date.parse(w.time)) : ''}`) : ''}</div>`);
    }
    if (L === 'board') b.push(this.forecastBanner(now, faa));
    const html = b.join(''); const el = this.$('.banners');
    if (el.dataset.k !== html) { el.dataset.k = html; el.innerHTML = html; }
    if (L === 'gps') this.renderForecastCard(now, faa);
  }
  shuttleBanner(r) {
    const pct = Math.min(1, r.along / r.totalM); const txt = r.etaS < 45 ? 'arriving now' : `arriving in ${formatEta(r.etaS)}`;
    return `<div class="bn bn-shuttle"><b>Hotel shuttle · Van 1 ${esc(txt)}</b><span>${(r.remainingM / 1609.34).toFixed(1)} mi to go · ${Math.round((r.speedSmooth || 0) * 2.237)} mph${r.inGeofence ? ' · inside arrival zone' : ''}</span><span class="bn-bar"><i style="transform:scaleX(${pct.toFixed(3)})"></i></span><span class="live">Estimated from GPS</span></div>`;
  }
  wave(now, faa) { return forecastWave(this.fl?.arr || sampleArrivals(now), { now, faaArrivalDelayMin: faa.arrivalDelayMin || 0 }); }
  forecastBanner(now, faa) {
    const w = this.wave(now, faa); const maxG = Math.max(1, ...w.bins.map((x) => x.guests)); const hot = (x) => w.windowStart && x.t >= w.windowStart && x.t < w.windowEnd;
    const head = w.guests ? `${w.heavy ? 'Heavy arrivals' : 'Next arrivals peak'} ${fmtHM(w.windowStart)}–${fmtT(w.windowEnd)} · ${w.flights} flights · ~${w.guests} guests est.` : 'No arrivals in the next 3 hours';
    return `<div class="bn bn-fc"><div class="fc-txt"><b>Arrival forecast</b><span class="fc-h">${esc(head)}</span><span class="fc-m">How this is estimated: seats × ${Math.round(w.params.loadFactor * 100)}% load factor × ${Math.round(w.params.shareStaying * 100)}% staying with us, by estimated landing time${faa.arrivalDelayMin ? ` + ${faa.live ? 'live' : 'demo'} FAA delay (${faa.arrivalDelayMin} min)` : ''}; guests reach the curb ~${w.params.curbLagMin} min after landing.</span></div><div class="fc-chart" aria-hidden="true">${w.bins.map((x, i) => `<span class="bar${hot(x) ? ' hot' : ''}" style="--v:${(x.guests / maxG).toFixed(3)};--i:${i}"></span>`).join('')}</div></div>`;
  }
  renderForecastCard(now, faa) {
    const w = this.wave(now, faa); const fc = this.$('.fc'); const k = `${w.windowStart}|${w.guests}|${faa.arrivalDelayMin}`; if (fc.dataset.k === k) return; fc.dataset.k = k;
    const maxG = Math.max(1, ...w.bins.map((x) => x.guests));
    fc.innerHTML = `<p class="fc-k">Arrival forecast</p><p class="fc-hh">${w.guests ? `${w.heavy ? 'Heavy arrivals' : 'Next peak'} ${fmtHM(w.windowStart)}–${fmtT(w.windowEnd)}` : 'No arrivals in the next 3 hours'}</p><p class="fc-s">${w.flights} flights · ~${w.guests} guests est.</p><div class="fc-chart" aria-hidden="true">${w.bins.map((x, i) => `<span class="bar${w.windowStart && x.t >= w.windowStart && x.t < w.windowEnd ? ' hot' : ''}" style="--v:${(x.guests / maxG).toFixed(3)};--i:${i}"></span>`).join('')}</div><p class="fc-m">Seats × load factor × share staying, plus live FAA delay. Estimate.</p>`;
    if (!this.alertsSeeded && w.heavy) { this.alertsSeeded = true; this.pushAlert(arrivalWave({ start: fmtHM(w.windowStart), end: fmtT(w.windowEnd), flights: w.flights, guests: w.guests, curbFrom: fmtT(w.curbFrom) })); }
  }
  renderTicker() {
    const s = this.status; const pl = this.client(); const parts = [];
    if (s?.metar?.raw) parts.push(`Live ${s.metar.raw}`);
    if (s?.taf?.raw) parts.push(`Live ${s.taf.raw.slice(0, 120)}…`);
    if (pl?.client?.tagline) parts.push(pl.client.tagline);
    parts.push('Flight rows: sample data, fictional airlines');
    const txt = parts.map(esc).join('<i aria-hidden="true">◆</i>');
    const tr = this.$('.tick-track'); if (tr.dataset.k === txt) return; tr.dataset.k = txt;
    tr.innerHTML = `<span>${txt}</span><span aria-hidden="true">${txt}</span>`;
  }

  // ---------- once a second
  tick(force) {
    const now = Date.now(); this.lastTick = now; const hm = fmtHM(now); const c = this.$('.clk-hm');
    if (c.dataset.v !== hm) { flap(c, hm, this.rm || force); c.dataset.v = hm; }
    this.$('.clk-ap').textContent = ` ${ampm(now)} ${TZL}`; this.$('.clk-date').textContent = fmtDate(now);
    if (this.paused && !force) return;
    if (this.boards.dep && this.fl.dep) this.renderBoard('dep', this.fl.dep, now);
    if (this.boards.arr && this.fl.arr) this.renderBoard('arr', this.fl.arr, now);
    if (now - (this.bannerAt || 0) > 5000 || force) { this.bannerAt = now; this.renderBanners(now); }
    if (!this.alertsSeeded && this.screen.dataset.layout !== 'gps') { const w = this.wave(now, this.faaPrograms()); if (w.heavy) { this.alertsSeeded = true; this.pushAlert(arrivalWave({ start: fmtHM(w.windowStart), end: fmtT(w.windowEnd), flights: w.flights, guests: w.guests, curbFrom: fmtT(w.curbFrom) })); } }
    const faa = this.faaPrograms(); const fk = faa.programs.length ? faa.live + faa.programs[0].kind : '';
    if (fk && fk !== this.faaAlerted) { this.faaAlerted = fk; const p = faa.programs[0]; const m = faaDelay({ airport: 'ORD', kind: p.kind, avgMin: p.avgMin, weather: p.weather }); if (!faa.live) m.text = 'DEMO: ' + m.text; this.pushAlert(m); }
    const al = this.status?.alerts?.[0]; if (al && al.event !== this.wxAlerted) { this.wxAlerted = al.event; this.pushAlert(weatherAlert({ event: al.event, ends: al.ends ? fmtT(Date.parse(al.ends)) : '' })); }
  }

  renderBoard(kind, rows, now) {
    const B = this.boards[kind]; const L = this.screen.dataset.layout; const nb = this.$('.banners').children.length; const max = L === 'restaurant' ? (nb > 1 ? 6 : 7) : (nb > 2 ? 5 : 6);
    const landed = rows.filter((r) => r.status === 'Landed').slice(-1).map((r) => r.id);
    rows = rows.filter((r) => kind === 'dep' ? r.status !== 'Departed' || r.est > now - 2 * MIN : r.status !== 'Landed' || landed.includes(r.id)).slice(0, max);
    const seen = new Set(); const before = new Map();
    for (const [id, el] of B.rows) before.set(id, el.getBoundingClientRect().top);
    rows.forEach((f, idx) => {
      seen.add(f.id); let el = B.rows.get(f.id);
      if (!el) { el = h('div', 'row row-new'); el.setAttribute('role', 'row'); el.innerHTML = B.cols.map((c) => `<span role="cell" class="c c-${c.toLowerCase()}"></span>`).join(''); B.rows.set(f.id, el); requestAnimationFrame(() => el.classList.remove('row-new')); }
      if (B.el.children[idx] !== el) B.el.insertBefore(el, B.el.children[idx] || null);
      const cell = (n) => el.querySelector('.c-' + n); el.classList.toggle('row-cancel', f.status === 'Cancelled');
      setFlap(cell('time'), fmtHM(f.sched), this.rm);
      const cityCell = cell(kind === 'arr' ? 'origin' : 'destination');
      const gateNote = f.prevGate && now - f.gateChangedAt < 60e3 ? `Gate changed from ${f.prevGate}` : '';
      const ck = f.city + '|' + gateNote;
      if (cityCell.dataset.v !== ck) { cityCell.dataset.v = ck; cityCell.innerHTML = `<b>${esc(f.city)}</b><small class="${gateNote ? 'gate-note' : ''}">${gateNote ? esc(gateNote) : `${esc(f.airline)} · ${esc(f.flight)}`}</small>`; }
      setFlap(cell('code'), f.apt, this.rm);
      const g = cell('gate'); setFlap(g, f.gate, this.rm); g.classList.toggle('gate-chg', !!gateNote);
      if (cell('boarding')) { const m = Math.round((f.boardAt - now) / MIN); const close = Math.round((f.est - 5 * MIN - now) / MIN); cell('boarding').textContent = f.status === 'Cancelled' ? '—' : f.status === 'Departed' ? 'Closed' : m > 0 ? `in ${m} min` : close > 0 ? `closes in ${close} min` : 'Closed'; }
      const st = f.status === 'Delayed' ? `Delayed ${f.delayMin}m` : f.status === 'Early' ? `Early ${-f.delayMin}m` : f.status; const sc = cell('status');
      if (sc.dataset.v !== st) { const first = !sc.dataset.v; sc.dataset.v = st; const [cls, ic] = STATUS[f.status] || ['ok', '']; sc.innerHTML = `<span class="chip chip-${cls}${first || this.rm ? '' : ' pulse'}"><i aria-hidden="true">${ic}</i>${esc(st)}</span>`; }
    });
    for (const [id, el] of B.rows) if (!seen.has(id)) { B.rows.delete(id); el.classList.add('row-out'); setTimeout(() => el.remove(), this.rm ? 0 : 450); }
    if (!this.rm) for (const [id, el] of B.rows) { const b = before.get(id); if (b == null) continue; const dy = b - el.getBoundingClientRect().top; if (Math.abs(dy) > 1) { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`; requestAnimationFrame(() => { el.style.transition = ''; el.style.transform = ''; }); } }
  }

  // ---------- content rotation (CMS playlist)
  startAds() { clearTimeout(this.adT); this.adIdx = -1; this.inBreak = false; this.screen.classList.remove('adbreak'); this.adT = setTimeout(() => this.nextAd(), this.screen.dataset.layout === 'gps' ? 0 : 20000); }
  nextAd() {
    clearTimeout(this.adT); const pl = this.client(); if (!pl) return;
    if (this.paused) { this.adT = setTimeout(() => this.nextAd(), 1000); return; }
    const rot = activeRotation(pl, new Date(), TZ); if (!rot.length) return;
    const full = this.screen.dataset.layout !== 'gps';
    if (full && this.inBreak && this.breakLeft <= 0) { this.inBreak = false; this.screen.classList.remove('adbreak'); this.adT = setTimeout(() => this.nextAd(), 20000); return; } // board for 20 s
    if (full && !this.inBreak) { this.inBreak = true; this.breakLeft = 2; this.screen.classList.add('adbreak'); } // then two ads
    this.adIdx = (this.adIdx + 1) % rot.length; const it = rot[this.adIdx];
    const stage = this.$(full ? '.pane-adfull .ad-stage' : '.pane-side .ad-stage');
    const slide = h('div', 'slide', `<div class="kb">${adArt(it.image, pl.client.accent)}</div><div class="slide-txt"><span class="slide-k">${esc({ special: 'Special', ad: 'Featured', menu: 'Menu', notice: 'Guest info' }[it.kind])}</span><b>${esc(it.title)}</b><span class="slide-b">${esc(it.body || '')}</span>${it.price ? `<em>${esc(it.price)}</em>` : ''}<small>Sample content · ${esc(pl.client.name)}</small></div>`);
    stage.appendChild(slide); requestAnimationFrame(() => requestAnimationFrame(() => slide.classList.add('on')));
    [...stage.children].slice(0, -1).forEach((o) => { o.classList.remove('on'); setTimeout(() => o.remove(), 1200); });
    if (full) this.breakLeft--;
    this.adT = setTimeout(() => this.nextAd(), it.durationS * 1000);
  }

  // ---------- front-desk alert previews (phone split view)
  pushAlert(m) {
    this.alerts.unshift({ ...m, at: Date.now() }); this.alerts = this.alerts.slice(0, 5);
    const ol = this.$('.ph-list'); const li = h('li', 'ph-msg', `<span class="ph-k">${esc({ shuttle: 'Shuttle', wave: 'Arrival forecast', faa: 'FAA delay', weather: 'Weather', flight: 'Flight change' }[m.kind])} · ${fmtT(Date.now())}</span><span class="ph-t">${esc(m.text)}</span><span class="ph-d">${m.chars ? `${m.chars} characters · 1 SMS segment · ` : ''}not sent</span>`);
    ol.prepend(li); while (ol.children.length > 5) ol.lastChild.remove();
  }

  // ---------- map
  drawMap() {
    const m = this.map; const proj = projector(m.origin); const pts = this.route.points.map((p) => proj.fwd(p));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y); const pad = 320; const ASPECT = 1.4;
    let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    if ((x1 - x0) / (y1 - y0) > ASPECT) { const c = (y0 + y1) / 2, hh = (x1 - x0) / ASPECT / 2; y0 = c - hh; y1 = c + hh; } else { const c = (x0 + x1) / 2, hw = (y1 - y0) * ASPECT / 2; x0 = c - hw; x1 = c + hw; }
    this.proj = proj; const W = x1 - x0, H = y1 - y0; this.vb = { x0, y1 };
    const P = (x, y) => `${(x - x0).toFixed(0)},${(y1 - y).toFixed(0)}`; const line = (arr) => arr.map(([x, y]) => P(x, y)).join(' ');
    const Ls = m.layers; const lay = (k, cls) => (Ls[k] || []).map((a) => `<polyline class="${cls}" points="${line(a)}"/>`).join('');
    const rpath = 'M' + pts.map((p) => P(p.x, p.y)).join('L'); const prop = proj.fwd(this.route.property); const start = pts[0];
    this.$('.map').innerHTML = `<svg class="map-svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="100%" height="100%" class="m-bg"/>
      <g>${lay('taxiway', 'm-taxi')}${(Ls.terminal || []).map((a) => `<polygon class="m-term" points="${line(a)}"/>`).join('')}${lay('runway', 'm-rwy')}</g>
      ${lay('river', 'm-river')}${lay('minor', 'm-minor')}${lay('major', 'm-major')}${lay('motorway', 'm-mwy')}
      <path class="m-route" d="${rpath}"/><path class="m-trail" d="${rpath}"/>
      <g transform="translate(${P(prop.x, prop.y)})"><circle r="300" class="m-fence"/><g class="m-hotel"><rect x="-34" y="-34" width="68" height="68" rx="16"/><text y="14" text-anchor="middle">H</text></g></g>
      <g transform="translate(${P(start.x, start.y)})" class="m-start"><circle r="26"/><text y="10" text-anchor="middle">✈</text></g>
      <g class="m-van"><circle class="m-pulse" r="70"/><circle class="m-dot" r="34"/><path class="m-arrow" d="M0 -26 L16 14 L0 6 L-16 14z"/></g></svg>`;
    this.trail = this.$('.m-trail'); this.van = this.$('.m-van'); this.trailLen = this.trail.getTotalLength(); this.trail.style.strokeDasharray = `${this.trailLen} ${this.trailLen}`; this.trail.style.strokeDashoffset = this.trailLen;
    this.routeLen = cumulative(this.route.points).at(-1); this.$('.map-attr').textContent = '© OpenStreetMap contributors (ODbL)';
  }
  placeVan(lat, lon, brg, along) {
    const q = this.proj.fwd({ lat, lon }); const { x0, y1 } = this.vb;
    this.van.setAttribute('transform', `translate(${(q.x - x0).toFixed(1)} ${(y1 - q.y).toFixed(1)})`); this.van.querySelector('.m-arrow').setAttribute('transform', `rotate(${Math.round(brg)})`);
    this.trail.style.strokeDashoffset = (this.trailLen * (1 - Math.min(1, along / this.routeLen))).toFixed(1);
  }

  // ---------- shuttle
  startShuttle() { this.engine = new EtaEngine({ route: this.route.points, property: this.route.property }); return this.cfg.mode === 'server' ? this.startLive() : this.startReplay(); }
  async startReplay() {
    // Website: replay the position log exported from our Traccar server, through the same ETA engine.
    this.session = await this.json(this.cfg.sessionUrl); const ps = this.session.positions;
    const FAST = this.cfg.replayRate || 8; let simT = 0, i = 0, rate = FAST, endHold = 0; this.lastFrame = performance.now(); this.fps = { frames: 0, t0: performance.now() };
    const reset = () => { simT = 0; i = 0; rate = FAST; endHold = 0; this.engine.reset(); this.etaState = null; this.hideTakeover(); };
    const frame = (now) => {
      requestAnimationFrame(frame); this.fps.frames++;
      const dt = Math.min(0.25, (now - this.lastFrame) / 1000); this.lastFrame = now; if (this.paused) return;
      if (endHold > 0) { endHold -= dt; if (endHold <= 0) reset(); return; }
      simT += dt * rate;
      while (i < ps.length && ps[i].t <= simT) {
        const p = ps[i++]; const r = this.engine.update({ lat: p.lat, lon: p.lon, speed: p.speedKn * 0.514444, time: p.t * 1000 });
        this.etaState = { ...r, simT: p.t }; this.onEta(r);
        for (const ev of r.events) { if (ev.type === 'arriving') { rate = 1; this.showTakeover(r); } if (ev.type === 'arrived') { this.showArrived(); endHold = 9; } }
      }
      if (i >= ps.length && endHold <= 0) endHold = 9;
      const a = ps[Math.max(0, i - 1)], b = ps[Math.min(ps.length - 1, i)];
      const k = this.rm ? 0 : Math.max(0, Math.min(1, (simT - a.t) / ((b.t - a.t) || 1)));
      if (this.screen.dataset.layout === 'gps') this.placeVan(a.lat + (b.lat - a.lat) * k, a.lon + (b.lon - a.lon) * k, b.course ?? bearing(a, b), this.etaState ? this.etaState.along : 0);
      const lbl = rate > 1 ? `Replay ${rate}× speed` : 'Replay at real time'; const mr = this.$('.map-rate'); if (mr.textContent !== lbl) mr.textContent = lbl;
      if (this.takeover && this.etaState) this.updateTakeover(Math.max(0, this.etaState.etaS - (simT - this.etaState.simT)));
    };
    requestAnimationFrame(frame);
  }
  startLive() {
    // Local product: Server-Sent Events from our server, which listens to Traccar's WebSocket.
    const es = new EventSource(this.cfg.streamUrl); let prev = null, cur = null, t0 = 0;
    es.onmessage = (m) => { const s = JSON.parse(m.data); if (s.status !== 'live') { this.$('.map-rate').textContent = 'Waiting for the van (Traccar)'; return; }
      prev = cur; cur = s; t0 = performance.now(); this.etaState = { ...s.eta, at: performance.now() }; this.onEta(s.eta);
      for (const ev of s.eta.events || []) { if (ev.type === 'arriving') this.showTakeover(s.eta); if (ev.type === 'arrived') { this.showArrived(); setTimeout(() => this.hideTakeover(), 9000); } } };
    const frame = (now) => { requestAnimationFrame(frame); if (this.paused || !cur) return;
      const span = prev ? Math.max(500, cur.fix.time - prev.fix.time) : 1; const k = !prev || this.rm ? 1 : Math.min(1, (now - t0) / span);
      const a = prev ? prev.fix : cur.fix, b = cur.fix; if (this.screen.dataset.layout === 'gps') this.placeVan(a.lat + (b.lat - a.lat) * k, a.lon + (b.lon - a.lon) * k, b.bearing ?? 0, cur.eta.along);
      this.$('.map-rate').textContent = `Live from Traccar · fix ${fmtT(b.time)}`;
      if (this.takeover) this.updateTakeover(Math.max(0, cur.eta.etaS - (now - this.etaState.at) / 1000)); };
    requestAnimationFrame(frame);
  }
  onEta(r) {
    if (this.screen.dataset.layout !== 'gps') return; const now = Date.now();
    if (now - (this.etaBannerAt || 0) > 900) { this.etaBannerAt = now; this.renderBanners(now); }
  }
  showTakeover(r) {
    if (this.screen.dataset.layout !== 'gps') return;
    const pl = this.client(); this.pushAlert(shuttleArriving({ van: 'Van 1', property: pl?.client?.name || 'the hotel', etaS: r?.etaS ?? 60 }));
    this.takeover = true; const t = this.$('.take'); const C = 2 * Math.PI * 150;
    t.querySelector('.take-in').innerHTML = `<p class="take-k">Hotel shuttle</p><p class="take-h">Your shuttle is arriving in 1 minute</p>
      <div class="ring"><svg viewBox="0 0 340 340" aria-hidden="true" focusable="false"><circle cx="170" cy="170" r="150" class="ring-bg"/><circle cx="170" cy="170" r="150" class="ring-fg" style="stroke-dasharray:${C};stroke-dashoffset:0"/></svg><b class="ring-n">60</b><span class="ring-u">seconds (est.)</span></div>
      <p class="take-s">Please make your way to the front entrance.</p><p class="take-e">Estimated from GPS · Rendering, simulated data</p>`;
    t.classList.add('on'); this.$('.acc-live').textContent = 'Shuttle alert shown on screen: Your shuttle is arriving in 1 minute.';
    if (this.chime) this.playChime();
  }
  updateTakeover(s) { const n = this.$('.ring-n'); if (!n) return; const v = String(Math.ceil(Math.min(60, s))); if (n.textContent !== v) { n.textContent = v; this.$('.ring-fg').style.strokeDashoffset = (2 * Math.PI * 150 * (1 - Math.min(60, s) / 60)).toFixed(1); } }
  showArrived() {
    if (!this.takeover) return; const t = this.$('.take');
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
