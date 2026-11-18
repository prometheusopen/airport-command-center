// Live public feeds: FAA NAS airport status (XML), NWS api.weather.gov, Aviation Weather Center
// METAR/TAF. No keys. Isomorphic (Node server and Vercel function)
import { TtlCache } from './cache.js';
export const UA = 'PrometheusOpen-AirportCommandCenter/0.1 (contact: mario.paredes@agentmail.to)';
export const TTL = { faa: 120e3, obs: 300e3, alerts: 120e3, metar: 300e3, taf: 1800e3 };

const tag = (s, t) => { const m = s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? m[1].trim() : null; };
const all = (s, t) => [...s.matchAll(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'g'))].map((m) => m[0]);
const mins = (x) => { if (!x) return null; let m = 0; const h = x.match(/(\d+)\s*hour/); const mm = x.match(/(\d+)\s*minute/); if (h) m += +h[1] * 60; if (mm) m += +mm[1]; return h || mm ? m : null; };
const weatherish = (r) => /WX|WEATHER|THUNDERSTORM|SNOW|WIND|LOW CEIL|VIS/i.test(r || '');

// Parse the FAA ATCSCC airport status XML (DTD: fly.faa.gov/AirportStatus.dtd) for one airport (IATA, e.g. ORD).
export function parseFaa(xml, arpt) {
  const out = { updated: tag(xml, 'Update_Time'), airport: arpt, programs: [] };
  for (const dt of all(xml, 'Delay_type')) {
    const name = tag(dt, 'Name') || '';
    for (const g of all(dt, 'Ground_Delay')) if (tag(g, 'ARPT') === arpt) out.programs.push({ kind: 'Ground delay', reason: tag(g, 'Reason'), avgMin: mins(tag(g, 'Avg')), maxMin: mins(tag(g, 'Max')), weather: weatherish(tag(g, 'Reason')), affects: 'arrivals' });
    for (const g of all(dt, 'Program')) if (tag(g, 'ARPT') === arpt) out.programs.push({ kind: 'Ground stop', reason: tag(g, 'Reason'), until: tag(g, 'End_Time'), weather: weatherish(tag(g, 'Reason')), affects: 'arrivals' });
    for (const g of all(dt, 'Delay')) if (tag(g, 'ARPT') === arpt) {
      const ad = all(g, 'Arrival_Departure')[0] || ''; const type = (ad.match(/Type="(\w+)"/) || [])[1] || 'Arrival/Departure';
      const mn = mins(tag(ad, 'Min')), mx = mins(tag(ad, 'Max'));
      out.programs.push({ kind: `${type} delay`, reason: tag(g, 'Reason'), minMin: mn, maxMin: mx, avgMin: mn != null && mx != null ? Math.round((mn + mx) / 2) : mn ?? mx, trend: tag(ad, 'Trend'), weather: weatherish(tag(g, 'Reason')), affects: type.toLowerCase().startsWith('arr') ? 'arrivals' : 'departures' });
    }
    if (/Closure/i.test(name)) for (const g of all(dt, 'Airport')) if (tag(g, 'ARPT') === arpt) {
      const r = tag(g, 'Reason') || ''; // Most closures are NOTAM'd partial closures (e.g. GA only); flag, don't alarm.
      out.programs.push({ kind: 'Closure notice', reason: r.slice(0, 140), start: tag(g, 'Start'), reopen: tag(g, 'Reopen'), partial: /EXC|TO NON SKED|TRANSIENT/i.test(r), affects: 'notice' });
    }
  }
  // Average arrival delay to apply to not-yet-landed arrivals (used by the arrival forecast).
  const arr = out.programs.filter((p) => p.affects === 'arrivals' && p.avgMin != null);
  out.arrivalDelayMin = arr.length ? Math.max(...arr.map((p) => p.avgMin)) : 0;
  out.groundStop = out.programs.some((p) => p.kind === 'Ground stop');
  out.weatherDelay = out.programs.some((p) => p.weather);
  return out;
}

const iconKind = (url = '', isDay = true) => {
  const code = (url.match(/\/(day|night)\/([a-z_]+)/) || [])[2] || '';
  const night = /\/night\//.test(url) || !isDay;
  if (/tsra|tornado|hurricane/.test(code)) return 'storm';
  if (/snow|sleet|blizzard|fzra/.test(code)) return 'snow';
  if (/rain|shra/.test(code)) return 'rain';
  if (/fog|haze|smoke|dust/.test(code)) return 'fog';
  if (/wind/.test(code)) return 'wind';
  if (/ovc|bkn/.test(code)) return 'cloudy';
  if (/sct|few/.test(code)) return night ? 'partly-night' : 'partly';
  return night ? 'clear-night' : 'clear';
};
const c2f = (c) => (c == null ? null : Math.round(c * 9 / 5 + 32));
export function parseObs(j) {
  const p = j.properties || {};
  const kmh = p.windSpeed?.value; const gust = p.windGust?.value;
  return { time: p.timestamp, station: (p.station || '').split('/').pop(), text: p.textDescription, tempF: c2f(p.temperature?.value), windMph: kmh == null ? null : Math.round(kmh / 1.609), gustMph: gust == null ? null : Math.round(gust / 1.609), windDir: p.windDirection?.value, visMi: p.visibility?.value == null ? null : +(p.visibility.value / 1609).toFixed(1), icon: iconKind(p.icon) };
}
export function parseAlerts(j) { return (j.features || []).map((f) => ({ event: f.properties.event, headline: f.properties.headline, severity: f.properties.severity, ends: f.properties.ends || f.properties.expires })).slice(0, 3); }
export function parseMetar(arr) { const m = (arr || [])[0]; if (!m) return null; const ceil = (m.clouds || []).filter((c) => /BKN|OVC|OVX/.test(c.cover)).map((c) => c.base).sort((a, b) => a - b)[0] ?? null; return { raw: m.rawOb, time: m.reportTime, fltCat: m.fltCat, windKt: m.wspd, gustKt: m.wgst ?? null, visib: m.visib, ceilingFt: ceil, tempF: c2f(m.temp) }; }
export function parseTaf(arr) { const t = (arr || [])[0]; return t ? { raw: t.rawTAF, issued: t.issueTime } : null; }

// Fetched through the shared server-side cache (lib/cache.js): one upstream call per TTL for every
// screen; upstream errors keep the last good value, marked stale, rather than failing the screen.
export const cache = new TtlCache();
async function cached(key, ttl, url, kind) {
  const r = await cache.get(key, ttl, async () => {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: kind === 'xml' ? 'application/xml' : 'application/geo+json, application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return kind === 'xml' ? res.text() : res.json();
  });
  return { at: r.at, body: r.value, ok: r.ok, stale: r.stale, error: r.error };
}

export const AIRPORTS = { ORD: { iata: 'ORD', icao: 'KORD', lat: 41.9786, lon: -87.9048, tz: 'America/Chicago', label: 'ORD' } };

export async function airportStatus(code = 'ORD') {
  const a = AIRPORTS[code]; if (!a) throw new Error('unknown airport');
  const [faa, obs, alerts, metar, taf] = await Promise.all([
    cached('faa', TTL.faa, 'https://nasstatus.faa.gov/api/airport-status-information', 'xml'),
    cached('obs:' + a.icao, TTL.obs, `https://api.weather.gov/stations/${a.icao}/observations/latest`),
    cached('alerts:' + a.icao, TTL.alerts, `https://api.weather.gov/alerts/active?point=${a.lat},${a.lon}`),
    cached('metar:' + a.icao, TTL.metar, `https://aviationweather.gov/api/data/metar?ids=${a.icao}&format=json`),
    cached('taf:' + a.icao, TTL.taf, `https://aviationweather.gov/api/data/taf?ids=${a.icao}&format=json`),
  ]);
  const src = (x, name) => ({ name, ok: x.ok, stale: !!x.stale, fetchedAt: new Date(x.at).toISOString(), error: x.error });
  return {
    airport: { code: a.iata, icao: a.icao, tz: a.tz },
    generatedAt: new Date().toISOString(),
    faa: faa.body ? parseFaa(faa.body, a.iata) : null,
    weather: obs.body ? parseObs(obs.body) : null,
    alerts: alerts.body ? parseAlerts(alerts.body) : [],
    metar: metar.body ? parseMetar(metar.body) : null,
    taf: taf.body ? parseTaf(taf.body) : null,
    sources: [src(faa, 'FAA NAS Status (nasstatus.faa.gov)'), src(obs, 'NWS api.weather.gov observation'), src(alerts, 'NWS api.weather.gov alerts'), src(metar, 'aviationweather.gov METAR'), src(taf, 'aviationweather.gov TAF')],
  };
}
