# Airport Command Center (phase 0)

Lobby and restaurant flight screens with weather, FAA delays, an arrival forecast, hotel-shuttle GPS
with a one-minute arrival alert, and the client's own specials. Phase 0 runs at $0 on one machine.

**Data honesty.** Flight rows are **sample data** with fictional airlines until a licensed feed with
written display rights is approved. The shuttle route is **simulated** (OpenStreetMap roads, replayed
through a real Traccar server). Weather (NWS, METAR/TAF) and FAA NAS status are **live**.

## Architecture

```
 FlightFeed adapters (lib/flightfeed.js)          Public feeds (lib/feeds.js)
   sample (default, fictional airlines)             FAA NAS status, NWS obs + alerts, AWC METAR/TAF
   aerodatabox   (stub, off, no key)                        |
   aviationstack (stub, off, no key)                        |
        |  failover order: FLIGHT_FEEDS                     |
        v                                                   v
  +---------------- one caching server (server/server.js, lib/cache.js) ----------------+
  |  fetch once per TTL for every screen at every property; single-flight;              |
  |  stale-while-error (last good data, marked stale, up to 6 h)                         |
  |  Traccar WebSocket -> ETA + geofence engine (lib/eta.js) -> SSE to screens          |
  |  content manager (cms/) -> published playlist per client                             |
  |  alerts (lib/alerts.js, lib/changes.js) -> TextAlert (lib/textalert.js):             |
  |     preview sink (on) | Twilio adapter (disabled stub)                               |
  +--------------------------------------------------------------------------------------+
        |  /board?property=demo-hotel&screen=lobby-1&skin=espresso
        v
  Screens: any browser in kiosk mode, e.g. LG webOS "Play via URL"; no media player.
```

| Component | Status |
|---|---|
| FAA NAS, NWS, METAR/TAF via the caching server | Live |
| FlightFeed interface + sample adapter | Built (sample data) |
| AeroDataBox / AviationStack adapters | Stubbed, disabled: no keys, no requests. Needs a paid plan, written display rights, and an OK |
| Server-side cache (TTL, single-flight, stale-while-error) | Built, tested |
| Board URL per property/screen with skin | Built (`data/properties.json`) |
| Kiosk mode (no cursor, reconnect, reload guard, pixel shift) | Built; **not tested on LG hardware** |
| Alerts: flight changes, shuttle, weather, FAA banner, arrival forecast | Built (on screen); texts are previews |
| TextAlert: Twilio adapter | Stubbed, disabled. No account, no number, no 10DLC registration |
| Shuttle ETA + geofence + 60 s takeover | Built, tested; route simulated |
| Content manager (SQLite) + playlist rotation | Built |

Run: `npm test`, then `npm start` (http://127.0.0.1:8795, admin at `/admin`, boards at `/board?...`).
Feed status: `/api/board/feeds`. Alert previews: `/api/alerts/preview`.

### Config (.env, gitignored)
`PORT`, `AIRPORT=ORD`, `FLIGHT_FEEDS=sample` (comma list, failover order; `sample` is always last),
`FLIGHT_TTL_S=60`, `TEXT_ALERTS=preview`, `TRACCAR_URL`, `TRACCAR_EMAIL`, `TRACCAR_PASSWORD`, `DEVICE_ID`.

## Board URLs

`/board?property=<id>&screen=<id>&skin=<graphite|steel|espresso|caramel>` (skin optional; default
comes from the client's setting in the content manager). Properties and screens: `data/properties.json`.

## Setting up an LG webOS signage screen ("Play via URL")

We have **not** tested this on LG hardware yet. Steps follow LG's webOS Signage documentation; menu
names vary by model and firmware.

1. Put the screen on the property network (wired preferred). Make sure it can reach the board server.
2. Open the installation menu (often `Settings` > `General` > `Play via URL`, or the hidden
   installer menu on the remote) and turn **Play via URL** on.
3. Enter the board URL for that screen, e.g.
   `https://<server>/board?property=demo-hotel&screen=lobby-1&skin=espresso`.
4. Set the **on/off schedule** under `Settings` > `General` > `Time settings` > `On Timer` / `Off Timer`
   (or the scheduling menu on your model). Example: on 5:00 AM, off 1:00 AM. The page needs no
   interaction after power on.
5. Optional: turn on the panel's own pixel-shift or screen-saver protection; the board also shifts the
   picture by up to 2 px every 3 minutes.

What the board does on its own: hides the cursor and controls; scales 1920×1080 to the panel; if the
network drops it keeps the last data with a "Reconnecting…" pill and refetches when the network
returns; it reloads every 6 hours, or if its clock loop stalls, **only when the server answers**, so it
never lands on a browser error page.

## Costs

Phase 0: $0. Future cost lines (not bought): one small cloud server for the caching server, about
$6/mo; a licensed flight feed (plan and display rights to be quoted); optional manager texts via an
SMS provider (per-message plus number fees; needs 10DLC registration).

## Licence

Code: MIT (see `LICENSE`), copyright Prometheus Open. Data and third-party notices: `NOTICE`,
`docs/DATA-SOURCES.md`.
