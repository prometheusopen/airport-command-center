// Arrival forecast ("wave") — our own arithmetic, documented, not machine learning.
//   guests(flight) = seats x loadFactor x shareStaying
//   landing time   = row estimate, pushed later by the live FAA arrival delay when that is larger
//   window         = the 30-minute window (on a 10-minute grid) with the most expected guests
//                    in the look-ahead horizon; "heavy" if it reaches heavyGuests.
//   curb time      = landing + curbLagMin (deplane + bags), shown as "guests at the curb from ...".
// All parameters are per-property settings; the defaults are assumptions, not measurements.
export const WAVE_DEFAULTS = { loadFactor: 0.84, shareStaying: 0.03, curbLagMin: 25, windowMin: 30, stepMin: 10, horizonMin: 180, heavyGuests: 12 };
const MIN = 60e3;

export function forecastWave(arrivals, { now = Date.now(), faaArrivalDelayMin = 0, ...opt } = {}) {
  const p = { ...WAVE_DEFAULTS, ...opt };
  const flights = arrivals.filter((f) => f.status !== 'Cancelled' && f.status !== 'Landed').map((f) => {
    const own = f.delayMin || 0; const extra = Math.max(0, faaArrivalDelayMin - own);
    const land = (f.est ?? f.sched) + extra * MIN;
    return { ...f, land, appliedFaaMin: extra, guests: f.seats * p.loadFactor * p.shareStaying };
  }).filter((f) => f.land >= now && f.land <= now + p.horizonMin * MIN);
  const step = p.stepMin * MIN, start = Math.ceil(now / step) * step;
  const bins = [];
  for (let t = start; t < now + p.horizonMin * MIN; t += step) {
    const fs = flights.filter((f) => f.land >= t && f.land < t + step);
    bins.push({ t, guests: fs.reduce((s, f) => s + f.guests, 0), flights: fs.length });
  }
  const per = Math.round(p.windowMin / p.stepMin); let best = null;
  for (let i = 0; i + per <= bins.length; i++) {
    const g = bins.slice(i, i + per).reduce((s, b) => s + b.guests, 0);
    // Prefer, among equal windows, the one that starts with a landing (tightest framing).
    if (!best || g > best.guests + 1e-9 || (Math.abs(g - best.guests) < 1e-9 && !bins[best.i].flights && bins[i].flights)) best = { i, guests: g };
  }
  if (!best || best.guests <= 0) return { heavy: false, bins, params: p, flights: 0, guests: 0 };
  const ws = bins[best.i].t, we = ws + p.windowMin * MIN;
  const inWin = flights.filter((f) => f.land >= ws && f.land < we);
  return {
    heavy: best.guests >= p.heavyGuests,
    windowStart: ws, windowEnd: we, curbFrom: ws + p.curbLagMin * MIN,
    flights: inWin.length, seats: inWin.reduce((s, f) => s + f.seats, 0), guests: Math.round(best.guests),
    faaArrivalDelayMin, bins, params: p,
    method: `Seats × ${Math.round(p.loadFactor * 100)}% load factor × ${Math.round(p.shareStaying * 100)}% staying with us, on each flight's estimated landing time${faaArrivalDelayMin ? ` plus the live FAA arrival delay (${faaArrivalDelayMin} min)` : ''}; busiest ${p.windowMin}-minute window in the next ${p.horizonMin / 60} hours. Guests reach the curb about ${p.curbLagMin} min after landing.`,
  };
}
