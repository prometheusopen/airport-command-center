// Vercel serverless function (same origin as demo.html): live FAA NAS status + NWS + METAR/TAF for
// the demo airport. Only ORD is served, so this is not an open proxy. Responses are cached at the
// edge for 2 minutes (and in the warm instance), which keeps upstream calls well inside the
// published limits (AWC: 100 req/min; NWS: unpublished "generous" limit; FAA: none published).
import { airportStatus } from './_lib/feeds.mjs';
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
  try {
    const body = await airportStatus('ORD');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.statusCode = 200; res.end(JSON.stringify(body));
  } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'upstream unavailable' })); }
}
