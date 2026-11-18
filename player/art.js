// Our own SVG illustrations (Apache-2.0, drawn in code for this project): weather icons,
// content images for the sample ads, a monogram logo, and the lobby/restaurant room scenes.
// No third-party artwork, no real brands.

export function weatherIcon(kind) {
  const sun = `<g class="wx-sun"><circle cx="32" cy="32" r="11" fill="#ffc53d"/><g class="wx-rays" stroke="#ffc53d" stroke-width="3.5" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="32" y1="9" x2="32" y2="15" transform="rotate(${a} 32 32)"/>`).join('')}</g></g>`;
  const moon = `<g class="wx-moon"><path d="M40 14a18 18 0 1 0 10 32 15 15 0 0 1-10-32z" fill="#ffe7a3"/><circle class="wx-star" cx="16" cy="14" r="1.8" fill="#fff"/><circle class="wx-star s2" cx="22" cy="24" r="1.3" fill="#fff"/></g>`;
  const cloud = (cls = 'wx-cloud', fill = '#dfe7f2', dx = 0) => `<g class="${cls}" transform="translate(${dx} 0)"><path d="M18 46h30a10 10 0 0 0 0-20 14 14 0 0 0-27-2A11 11 0 0 0 18 46z" fill="${fill}"/></g>`;
  const drops = (c) => `<g class="wx-drops">${[20, 30, 40].map((x, i) => `<line class="wx-drop d${i}" x1="${x}" y1="50" x2="${x - 3}" y2="57" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`).join('')}</g>`;
  const flakes = `<g class="wx-flakes">${[20, 32, 44].map((x, i) => `<circle class="wx-flake d${i}" cx="${x}" cy="53" r="2.6" fill="#fff"/>`).join('')}</g>`;
  const bolt = `<path class="wx-bolt" d="M33 44l-6 10h6l-3 8 10-12h-6l3-6z" fill="#ffd400"/>`;
  const fog = `<g class="wx-fog" stroke="#cfd8e3" stroke-width="4" stroke-linecap="round"><line x1="12" y1="30" x2="52" y2="30"/><line class="f2" x1="8" y1="40" x2="46" y2="40"/><line x1="14" y1="50" x2="54" y2="50"/></g>`;
  const wind = `<g class="wx-wind" stroke="#cfe3f5" stroke-width="4" fill="none" stroke-linecap="round"><path d="M8 26h30a6 6 0 1 0-6-6"/><path class="f2" d="M8 36h40a6 6 0 1 1-6 6"/><path d="M8 46h22"/></g>`;
  const body = {
    clear: sun, 'clear-night': moon,
    partly: `<g transform="translate(-6 -6) scale(.8)">${sun}</g>${cloud('wx-cloud', '#e8eef6', 6)}`,
    'partly-night': `<g transform="translate(-4 -6) scale(.75)">${moon}</g>${cloud('wx-cloud', '#c9d3e0', 6)}`,
    cloudy: `${cloud('wx-cloud back', '#9fb0c5', -6)}${cloud('wx-cloud', '#dfe7f2', 4)}`,
    rain: `${cloud('wx-cloud', '#c3cfdd')}${drops('#7cc4ff')}`,
    snow: `${cloud('wx-cloud', '#dfe7f2')}${flakes}`,
    storm: `${cloud('wx-cloud', '#8e9db2')}${bolt}`,
    fog, wind,
  }[kind] || cloud();
  return `<svg class="wx-icon wx-${kind}" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">${body}</svg>`;
}

const plate = (cx, cy, r) => `<ellipse cx="${cx}" cy="${cy + 8}" rx="${r + 6}" ry="${r * 0.35 + 6}" fill="#000" opacity=".25"/><ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.42}" fill="#f4efe6"/><ellipse cx="${cx}" cy="${cy}" rx="${r * 0.78}" ry="${r * 0.32}" fill="#e9e1d3"/>`;
const steam = (x, y) => `<g class="art-steam" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".55"><path d="M${x} ${y}c-14-18 14-26 0-46"/><path class="s2" d="M${x + 34} ${y + 6}c-14-18 14-26 0-46"/></g>`;
export function adArt(key, accent = '#f2b33d') {
  const bg = (a, b) => `<defs><radialGradient id="g-${key}" cx="35%" cy="30%" r="90%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="800" height="500" fill="url(#g-${key})"/>`;
  const scenes = {
    breakfast: `${bg('#6b3f1d', '#1d1009')}${plate(400, 300, 230)}<rect x="250" y="235" width="150" height="110" rx="18" fill="#d99a4e" transform="rotate(-8 325 290)"/><rect x="262" y="247" width="126" height="86" rx="12" fill="#f0c27a" transform="rotate(-8 325 290)"/><ellipse cx="500" cy="290" rx="78" ry="52" fill="#fff"/><circle cx="510" cy="285" r="28" fill="#ffb300"/><circle cx="640" cy="200" r="46" fill="#c0392b"/><circle cx="600" cy="230" r="30" fill="#e67e22"/><rect x="120" y="120" width="70" height="120" rx="10" fill="${accent}" opacity=".85"/>${steam(140, 110)}`,
    coffee: `${bg('#4a2c1a', '#140b06')}<ellipse cx="400" cy="420" rx="230" ry="44" fill="#000" opacity=".3"/><ellipse cx="400" cy="400" rx="210" ry="40" fill="#efe7da"/><path d="M270 220h260l-24 170a30 30 0 0 1-30 26H324a30 30 0 0 1-30-26z" fill="#fbfaf7"/><path d="M528 250a52 52 0 0 1 0 104" stroke="#fbfaf7" stroke-width="22" fill="none"/><ellipse cx="400" cy="222" rx="130" ry="26" fill="#6f3b16"/><path d="M360 220c20-14 60-14 80 0-20 10-60 10-80 0z" fill="#d9a066"/>${steam(380, 180)}<rect x="0" y="0" width="800" height="16" fill="${accent}"/>`,
    bowl: `${bg('#2d4a2b', '#0c160b')}<ellipse cx="400" cy="400" rx="250" ry="56" fill="#000" opacity=".3"/><path d="M160 250h480a240 150 0 0 1-480 0z" fill="#f2ede4"/><ellipse cx="400" cy="250" rx="240" ry="60" fill="#e8dcc5"/><ellipse cx="320" cy="245" rx="70" ry="28" fill="#8bc34a"/><ellipse cx="470" cy="238" rx="60" ry="24" fill="#ff7043"/><ellipse cx="400" cy="262" rx="64" ry="20" fill="#ffd54f"/><circle cx="540" cy="255" r="22" fill="#7b1fa2"/><circle cx="260" cy="262" r="16" fill="#43a047"/><circle cx="430" cy="226" r="12" fill="#fff"/>`,
    cocktail: `${bg('#3a1d4a', '#0e0614')}<circle cx="600" cy="150" r="90" fill="${accent}" opacity=".25"/><path d="M280 140h240L400 290z" fill="#ff8a65" opacity=".9"/><path d="M300 150h200L400 270z" fill="#ffab91"/><rect x="392" y="288" width="16" height="120" fill="#e0e0e0"/><ellipse cx="400" cy="412" rx="70" ry="14" fill="#e0e0e0"/><circle cx="470" cy="150" r="26" fill="#cddc39"/><circle cx="470" cy="150" r="18" fill="#e6ee9c"/><g class="art-bubbles" fill="#fff" opacity=".7"><circle cx="390" cy="230" r="4"/><circle class="s2" cx="410" cy="210" r="3"/><circle cx="400" cy="190" r="2.5"/></g>`,
    pastry: `${bg('#5a3a12', '#190f04')}${plate(400, 320, 240)}<path d="M240 300c40-90 280-90 320 0-60 30-260 30-320 0z" fill="#d68a2e"/><path d="M280 290c30-60 210-60 240 0" stroke="#f0b35a" stroke-width="16" fill="none"/><path d="M320 286c20-36 140-36 160 0" stroke="#f7cc80" stroke-width="12" fill="none"/><circle cx="600" cy="250" r="34" fill="#8d5524"/><circle cx="600" cy="250" r="22" fill="#c68642"/>`,
    room: `${bg('#1d3550', '#081320')}<rect x="120" y="260" width="560" height="140" rx="18" fill="#eef2f6"/><rect x="120" y="230" width="560" height="50" rx="16" fill="#c7d3e0"/><rect x="160" y="200" width="160" height="70" rx="18" fill="#fff"/><rect x="480" y="200" width="160" height="70" rx="18" fill="#fff"/><rect x="100" y="120" width="600" height="90" rx="14" fill="#2a4a6b"/><circle cx="700" cy="110" r="40" fill="${accent}" opacity=".85"/><rect x="0" y="400" width="800" height="100" fill="#0b1a2a"/>`,
  };
  return `<svg class="art art-${key}" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${scenes[key] || scenes.room}</svg>`;
}

export function monogram(text = 'SH', accent = '#f2b33d') {
  return `<svg class="logo-mark" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false"><rect x="2" y="2" width="60" height="60" rx="16" fill="${accent}"/><text x="32" y="41" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="800" font-size="24" fill="#111">${String(text).replace(/[<&>"]/g, '')}</text></svg>`;
}

// Room illustrations: the TV sits on the wall of a hotel lobby or behind an airport restaurant counter.
export function roomArt(scene) {
  if (scene === 'restaurant') return `<svg class="room-art" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs><linearGradient id="rw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f3a"/><stop offset="1" stop-color="#1a1e26"/></linearGradient><linearGradient id="rc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a35"/><stop offset="1" stop-color="#5b3a22"/></linearGradient></defs>
    <rect width="1600" height="1000" fill="url(#rw)"/>
    <g fill="#323947">${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 100}" y="0" width="96" height="70"/>`).join('')}</g>
    <g class="room-lamps">${[260, 800, 1340].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="70" stroke="#555" stroke-width="3"/><path d="M${x - 40} 110h80l-18-40h-44z" fill="#f2b33d"/><ellipse class="lamp-glow" cx="${x}" cy="118" rx="70" ry="18" fill="#ffd27a" opacity=".35"/>`).join('')}</g>
    <rect x="0" y="760" width="1600" height="240" fill="url(#rc)"/><rect x="0" y="748" width="1600" height="22" fill="#b07a4c"/>
    <g fill="#e9e3d8"><rect x="120" y="690" width="60" height="62" rx="6"/><rect x="200" y="700" width="70" height="52" rx="6"/><rect x="1330" y="690" width="60" height="62" rx="6"/><rect x="1410" y="704" width="80" height="48" rx="6"/></g>
    <g fill="#4e8f6b"><circle cx="1500" cy="640" r="40"/><circle cx="1470" cy="610" r="32"/></g>
    <rect x="0" y="960" width="1600" height="40" fill="#3a2516"/>
  </svg>`;
  return `<svg class="room-art" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs><linearGradient id="lw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e1d4"/><stop offset="1" stop-color="#d8cdbb"/></linearGradient><linearGradient id="lf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d6a55"/><stop offset="1" stop-color="#5d4e3e"/></linearGradient></defs>
    <rect width="1600" height="1000" fill="url(#lw)"/>
    <g stroke="#cfc3ae" stroke-width="2">${Array.from({ length: 17 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="820"/>`).join('')}</g>
    <rect x="0" y="820" width="1600" height="180" fill="url(#lf)"/>
    <g class="room-window"><rect x="40" y="120" width="180" height="560" rx="6" fill="#9cc3dd"/><rect x="40" y="120" width="180" height="560" rx="6" fill="none" stroke="#b9ab94" stroke-width="10"/><line x1="130" y1="120" x2="130" y2="680" stroke="#b9ab94" stroke-width="6"/></g>
    <g><rect x="380" y="740" width="840" height="100" rx="14" fill="#5a4a3a"/><rect x="360" y="720" width="880" height="30" rx="10" fill="#8a7458"/></g>
    <g fill="#3f7d5a"><path d="M1400 820c-60-120-20-220 40-260-10 90 30 160-40 260z"/><path d="M1420 820c40-140 120-180 160-180-60 60-70 120-160 180z"/><path d="M1410 820c-10-160 40-260 100-300-40 120-30 200-100 300z"/></g><rect x="1380" y="800" width="80" height="60" rx="10" fill="#c9b79c"/>
    <g fill="#8a7458"><rect x="1250" y="560" width="10" height="190"/><path d="M1225 560h60l-10-60h-40z" fill="#f3e4c4"/></g>
  </svg>`;
}
