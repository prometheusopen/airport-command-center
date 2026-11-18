// Vercel function: flight rows for every board, through the FlightFeed chain and the shared cache.
// Phase 0 chain is sample-only (fictional airlines). Paid adapters are disabled stubs; no keys.
import { FeedChain } from './_lib/flightfeed.mjs';
import { TtlCache } from './_lib/cache.mjs';
const chain = new FeedChain(['sample']); const cache = new TtlCache();
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
  try {
    const [a, d] = await Promise.all(['arrivals', 'departures'].map((k) => cache.get(k, 30e3, () => chain.get(k, 'ORD'))));
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=300'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.statusCode = 200; res.end(JSON.stringify({ arrivals: { ...a.value, stale: a.stale, fetchedAt: a.at }, departures: { ...d.value, stale: d.stale, fetchedAt: d.at } }));
  } catch (e) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'unavailable' })); }
}
