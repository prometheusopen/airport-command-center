// Website kiosk board: /board.html?property=demo-hotel&screen=lobby-1&skin=espresso
import { mountPlayer } from './player.js';
const q = new URLSearchParams(location.search); const SK = ['graphite', 'steel', 'espresso', 'caramel'];
(async () => {
  try {
    const props = await (await fetch('media/acc/properties.json', { cache: 'no-store' })).json();
    const pr = props.properties[q.get('property') || 'demo-hotel']; const sc = pr?.screens[q.get('screen') || 'lobby-1'];
    if (!sc) throw new Error('unknown property or screen');
    window.__board = await mountPlayer(document.getElementById('board'), { mode: 'static', kiosk: true, embed: q.get('embed') === '1', scene: sc.scene, gps: sc.gps, skin: SK.includes(q.get('skin')) ? q.get('skin') : null,
      statusUrl: '/api/airport-status', flightsUrl: '/api/board-flights', flightsEveryMs: 15000, healthUrl: '/api/board-flights',
      routeUrl: 'media/acc/route.json', mapUrl: 'media/acc/map.json', sessionUrl: 'media/acc/traccar-session.json', playlistUrl: (id) => `media/acc/playlist-${id}.json` });
  } catch (e) { document.getElementById('board').textContent = 'Board starting… retrying'; setTimeout(() => location.reload(), 15000); }
})();
