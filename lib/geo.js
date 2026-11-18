// Geodesy helpers shared by the server and the browser player. Apache-2.0.
export const R_EARTH = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Local equirectangular projection in metres around an origin (fine for a few km).
export function projector(origin) {
  const kx = Math.cos(rad(origin.lat)) * (Math.PI / 180) * R_EARTH;
  const ky = (Math.PI / 180) * R_EARTH;
  return {
    fwd: (p) => ({ x: (p.lon - origin.lon) * kx, y: (p.lat - origin.lat) * ky }),
    inv: (q) => ({ lon: origin.lon + q.x / kx, lat: origin.lat + q.y / ky }),
  };
}

// Cumulative distance along a polyline of {lat,lon}.
export function cumulative(line) {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + haversine(line[i - 1], line[i]));
  return out;
}

// Point at distance d along the polyline (linear interpolation).
export function pointAt(line, cum, d) {
  if (d <= 0) return { ...line[0], i: 0 };
  const total = cum[cum.length - 1];
  if (d >= total) return { ...line[line.length - 1], i: line.length - 2 };
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const t = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return { lat: line[lo].lat + (line[hi].lat - line[lo].lat) * t, lon: line[lo].lon + (line[hi].lon - line[lo].lon) * t, i: lo };
}
