// Copies the player, the shared logic modules, the published CMS playlists, the Traccar session
// export and the OSM-derived map/route into the public website (static) plus its one serverless
// function. Usage: node site/build-site.js /workspace/prometheus-open-flagship
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'); const SITE = process.argv[2];
if (!SITE) throw new Error('site path required');
const cp = (a, b) => { fs.mkdirSync(path.dirname(path.join(SITE, b)), { recursive: true }); fs.copyFileSync(path.join(ROOT, a), path.join(SITE, b)); console.log(a, '->', b); };
for (const f of ['player.js', 'art.js']) cp('player/' + f, 'js/acc/' + f);
for (const f of ['eta.js', 'geo.js', 'wave.js', 'samples.js', 'rotation.js', 'alerts.js', 'flightfeed.js', 'changes.js', 'cache.js']) cp('lib/' + f, 'js/acc/lib/' + f);
cp('player/player.css', 'css/acc.css');
cp('data/route.json', 'media/acc/route.json'); cp('data/map.json', 'media/acc/map.json'); cp('data/traccar-session.json', 'media/acc/traccar-session.json');
for (const id of ['sample-hotel', 'sample-cafe']) cp(`data/published/${id}.json`, `media/acc/playlist-${id}.json`);
cp('site/api/airport-status.mjs', 'api/airport-status.mjs'); cp('site/api/board-flights.mjs', 'api/board-flights.mjs');
// Function helpers as .mjs (imports rewritten to .mjs). Underscore folder: bundled, not routed.
for (const f of ['feeds', 'cache', 'flightfeed', 'samples']) { const src = fs.readFileSync(path.join(ROOT, `lib/${f}.js`), 'utf8').replace(/from '\.\/(\w+)\.js'/g, "from './$1.mjs'"); fs.mkdirSync(path.join(SITE, 'api/_lib'), { recursive: true }); fs.writeFileSync(path.join(SITE, `api/_lib/${f}.mjs`), src); console.log(`lib/${f}.js -> api/_lib/${f}.mjs`); }
cp('data/properties.json', 'media/acc/properties.json'); cp('site/board.js', 'js/acc/board.js');
fs.writeFileSync(path.join(SITE, 'board.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'">
<title>Flight board (demo)</title><link rel="stylesheet" href="css/acc.css"><link rel="icon" href="favicon.svg">
<style>html,body{margin:0;background:#000;color:#999;overflow:hidden;height:100%;font-family:system-ui,sans-serif}</style></head>
<body><main id="board" aria-label="Flight board, rendering with simulated data"></main><script type="module" src="js/acc/board.js"></script></body></html>
`); console.log('-> board.html');
// Website gets third-party attributions only (no license claim for our code on the site).
fs.writeFileSync(path.join(SITE, 'media/acc/NOTICE.txt'), fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8').split('\n').filter((l) => !/^Copyright|MIT|LICENSE/.test(l)).join('\n'));
