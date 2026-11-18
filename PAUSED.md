# Airport Command Center phase 0: PAUSED

Paused 2026-11-18 01:26 AM ET by CEO direction. Site is frozen: deploy nothing (not even a preview) until unpaused.

## Where things are
- Code repo: `/workspace/prometheus-open/repos/airport-command-center` (local git, **no remote, nothing pushed**). Last commit: "Paused state …" (see `git log`). MIT LICENSE, copyright Prometheus Open. `npm test` = 32 passing.
- Website source: `/workspace/prometheus-open-flagship` (Lobby screen tab, `board.html`, `api/airport-status.mjs`, `api/board-flights.mjs`, size guide, component table). Build: `python3 src/build.py` then `node site/build-site.js /workspace/prometheus-open-flagship` from the repo.
- Deploy staging: `/workspace/po-deploy` was restaged at ~01:19 AM ET (backup of the previous staging: `/workspace/po-deploy-pre-lobby2-backup`).
- Evidence: `evidence/screens` (47 PNGs: each checklist item, 4 skins, split phone view, kiosk boards, restaurant, CMS admin; desktop + phone), `evidence/video` (4 MP4s, 0.3 to 1.2 MB each), `evidence/qa` (axe JSON/log, FPS log). Benchmark: `BENCHMARK.md`. Cost line for the ~$6/mo server added to `COST-LINES.md` (future, not bought).

## Done
- Checklist 1 to 11: room-to-screen zoom (FLIP), header (logo slot, name, amenity tag, local time, weather), Departures + Arrivals columns (time, city + airline + flight, airport code, gate, status), badges (On time, Early Xm, Scheduled, Boarding, Final call, Delayed Xm, Landed, Departed, Cancelled with strikethrough; min contrast 5.34:1 in all skins), "Live · auto refresh" only on NWS/FAA, "Gate changed from X" flash (1 Hz, 3 times; static under reduced motion), front-desk weather notice (live NWS), skins (graphite, steel blue, espresso, caramel gold), shuttle countdown banner (ETA module), red FAA banner (live; labelled demo toggle when none), split view with front-desk phone ("Alert preview · SMS delivery not connected in demo").
- Architecture: FlightFeed interface (sample default; AeroDataBox and AviationStack adapters are disabled stubs, no keys, no requests, failover order from config); one TTL cache with single-flight + stale-while-error for FAA/NWS and flights; board URL per property/screen with skin (`/board?property=demo-hotel&screen=lobby-1&skin=espresso`, site: `board.html?...`); kiosk mode (no cursor, reconnect pill, guarded 6 h reload, 2 px burn-in shift); alerts (flight changes, shuttle, weather, FAA, arrival forecast) behind TextAlert with a disabled Twilio stub; README with LG webOS "Play via URL" steps and on/off schedule (not tested on LG hardware).
- QA: axe 0 violations, desktop + phone, all pages + 12 lobby states + 3 kiosk boards. Reduced motion: 0 running animations; Pause: 0 running animations, ticker stops; max opacity cycle rate 1.43/s (under 3). FPS: phone emulation (4x CPU) 59.3 to 60 fps; desktop 1440x900 37 to 42 fps, 0 long tasks (this box has no GPU, so headless Chrome rasterizes in software; re-measure on real hardware).

## Not done / next steps (in order)
1. Rebuild the site with the last local CSS fix ("Code" column header was truncated to "CO…"; fixed in `player/player.css`, not yet copied to the site or the preview). Also check that the phone-width control sizes apply on the demo page.
2. Retake `traccar-desktop.png` (the replay was stopped before the shot): start Traccar (`/workspace/traccar-server`, `./jre/bin/java -jar tracker-server.jar conf/traccar.xml`), `node server/server.js`, `node replay/replay.js`, then `node qa/traccar-shot.cjs` about 150 s in.
3. Re-run `qa/checklist-shots.cjs` (desktop/phone) and `qa/axe-all.cjs` after step 1.
4. Only when unpaused and approved: restage `/workspace/po-deploy` and deploy ONE protected preview.
5. Open question for Mario: the Shuttle demo tab (`shuttle_screen()` in `src/apps.py`) still shows a phone mockup of unbuilt features, labelled "Coming". Keep, relabel, or replace it with the real Lobby screen?
6. Note: served JS (`js/acc/lib/flightfeed.js`) names the two stubbed providers in code and comments. Nothing on the rendered page names them.

## To restart locally (all stopped at pause)
Traccar (above); `cd repo && node server/server.js` (http://127.0.0.1:8795, admin `/admin`, boards `/board?...`); `node site/dev-server.js /workspace/prometheus-open-flagship 8796`.
