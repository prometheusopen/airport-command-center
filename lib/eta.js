// ETA + geofence engine. Our own code (Apache-2.0). Runs in Node (server, reading Traccar)
// and in the browser (website replay). No dependencies.
//
// Method (documented in docs/ETA.md):
//  1. Map-match each GPS fix to the planned route polyline (nearest segment, searched forward
//     from the last match so the van never "jumps back" on parallel roads).
//  2. remaining = route length - distance along route at the match.
//  3. Speed is smoothed with a time-based exponential moving average (tau = 20 s by default),
//     using the device-reported speed when present, else distance/time between fixes.
//  4. If the route carries expected speeds per point (v, m/s, from the road class), the ETA is the
//     time to drive the remaining route at those speeds, scaled by how the van is doing right now:
//     etaS = routeTime x clamp(smoothedExpected / max(smoothedSpeed, floorSpeed), 0.8, 1.3),
//     where smoothedExpected is the road-class speed under the van, smoothed the same way.
//     Without per-point speeds: etaS = remaining / max(smoothedSpeed, floorSpeed).
//     floorSpeed (default 4 m/s, ~9 mph) stops the ETA going to infinity at a red light.
//     Route points flagged ctl:'signal' or ctl:'stop' (OSM traffic signals / stop signs) ahead of
//     the van add an expected wait (signalWaitS default 15 s, stopWaitS 6 s) to the route time.
//  5. Geofence: a circle around the property (default 300 m). Inside it, the arrival alert fires
//     even if the ETA math says otherwise.
//  6. 'arriving' fires once when etaS <= alertS (60 s) or on geofence entry; it re-arms only if
//     etaS rises above rearmS (150 s), e.g. the van turns around. 'arrived' fires once within
//     arrivedM (60 m) of the property with an instantaneous speed < 2 m/s.
// Every ETA is an estimate; callers must label it so (result.label).
import { haversine, cumulative } from './geo.js';

function projectOnSegment(p, a, b, kx, ky) {
  const ax = a.lon * kx, ay = a.lat * ky, bx = b.lon * kx, by = b.lat * ky, px = p.lon * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return { t, dist: Math.hypot(px - qx, py - qy) };
}

export class EtaEngine {
  constructor({ route, property, signalWaitS = 15, stopWaitS = 6, geofenceM = 300, alertS = 60, rearmS = 150, arrivedM = 60, tauS = 20, floorSpeed = 4, searchBack = 3, searchAhead = 60, offRouteM = 120 } = {}) {
    if (!route || route.length < 2) throw new Error('route needs at least 2 points');
    this.route = route; this.cum = cumulative(route); this.total = this.cum[this.cum.length - 1];
    this.property = property || route[route.length - 1];
    Object.assign(this, { signalWaitS, stopWaitS, geofenceM, alertS, rearmS, arrivedM, tauS, floorSpeed, searchBack, searchAhead, offRouteM });
    const lat0 = route[0].lat * Math.PI / 180;
    this.kx = Math.cos(lat0) * Math.PI / 180 * 6371008.8; this.ky = Math.PI / 180 * 6371008.8;
    // Suffix sums of expected drive time per segment, when the route has speeds.
    this.hasV = route.every((p) => p.v > 0);
    if (this.hasV) { this.segT = new Float64Array(route.length); for (let i = route.length - 2; i >= 0; i--) this.segT[i] = this.segT[i + 1] + (this.cum[i + 1] - this.cum[i]) / route[i + 1].v + this.wait(route[i + 1]); }
    this.reset();
  }
  wait(p) { return p.ctl === 'signal' ? this.signalWaitS : p.ctl === 'stop' ? this.stopWaitS : 0; }
  routeTimeFrom(seg, along) {
    const i = Math.min(seg, this.route.length - 2); const segLen = this.cum[i + 1] - this.cum[i] || 1;
    const left = Math.max(0, this.cum[i + 1] - along); return this.segT[i + 1] + left / this.route[i + 1].v + (left > 8 ? this.wait(this.route[i + 1]) : 0);
  }
  reset() { this.seg = 0; this.along = 0; this.vs = null; this.ve = null; this.prevT = null; this.last = null; this.armed = true; this.arrived = false; this.wasInside = false; }

  match(p) {
    const tryRange = (lo, hi) => {
      let best = null;
      for (let i = Math.max(0, lo); i < Math.min(this.route.length - 1, hi); i++) {
        const r = projectOnSegment(p, this.route[i], this.route[i + 1], this.kx, this.ky);
        if (!best || r.dist < best.dist) best = { i, t: r.t, dist: r.dist };
      }
      return best;
    };
    let m = tryRange(this.seg - this.searchBack, this.seg + this.searchAhead);
    if (!m || m.dist > this.offRouteM) { const g = tryRange(0, this.route.length - 1); if (g && (!m || g.dist < m.dist)) m = g; }
    const along = this.cum[m.i] + (this.cum[m.i + 1] - this.cum[m.i]) * m.t;
    return { seg: m.i, along, offRouteM: m.dist };
  }

  // pos: {lat, lon, time (ms), speed (m/s, optional)}
  update(pos) {
    const m = this.match(pos);
    let inst = Number.isFinite(pos.speed) ? pos.speed : null;
    if (this.last) {
      const dt = (pos.time - this.last.time) / 1000;
      if (dt > 0) {
        if (inst == null) inst = haversine(this.last, pos) / dt;
        const a = 1 - Math.exp(-dt / this.tauS);
        this.vs = this.vs == null ? inst : this.vs + a * (inst - this.vs);
      }
    } else { this.vs = inst ?? 0; }
    // Never let the match run backwards by more than GPS noise.
    if (m.along >= this.along - 25 || m.offRouteM > this.offRouteM) { this.seg = m.seg; this.along = m.along; }
    this.last = pos;
    const remainingM = Math.max(0, this.total - this.along);
    const toProperty = haversine(pos, this.property);
    const v = Math.max(this.vs ?? 0, this.floorSpeed);
    let etaS = remainingM / v;
    if (this.hasV) {
      const vExp = this.route[Math.min(this.seg + 1, this.route.length - 1)].v;
      const dt = this.prevT == null ? 0 : (pos.time - this.prevT) / 1000; const a = this.ve == null ? 1 : 1 - Math.exp(-dt / this.tauS);
      this.ve = this.ve == null ? vExp : this.ve + a * (vExp - this.ve);
      etaS = this.routeTimeFrom(this.seg, this.along) * Math.min(1.3, Math.max(0.8, this.ve / v));
    }
    this.prevT = pos.time;
    const inGeofence = toProperty <= this.geofenceM;
    const events = [];
    if (this.armed && (etaS <= this.alertS || (inGeofence && !this.wasInside))) { events.push({ type: 'arriving', etaS, at: pos.time }); this.armed = false; }
    if (!this.armed && etaS > this.rearmS && !inGeofence) this.armed = true;
    if (!this.arrived && toProperty <= this.arrivedM && (inst ?? 0) < 2) { events.push({ type: 'arrived', at: pos.time }); this.arrived = true; }
    this.wasInside = inGeofence;
    return { along: this.along, remainingM, totalM: this.total, speedSmooth: this.vs, etaS, inGeofence, toPropertyM: toProperty, offRouteM: m.offRouteM, events, label: 'Estimated', time: pos.time };
  }
}

export function formatEta(etaS) {
  if (!Number.isFinite(etaS)) return '—';
  if (etaS < 45) return 'under 1 min';
  const m = Math.round(etaS / 60);
  return m <= 1 ? 'about 1 min' : `about ${m} min`;
}
