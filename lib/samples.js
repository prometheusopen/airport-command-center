// SAMPLE DATA generator for gate/arrival/departure rows (no licensed gate feed yet).
// Airlines, codes and flight numbers are FICTIONAL. Codes use a letter-digit-letter pattern that
// cannot collide with real two-character IATA or three-letter ICAO airline designators.
// Origin/destination cities are real places; gates are invented. Every row carries sample: true.
export const AIRLINES = [
  { code: 'A7U', name: 'Aurelline Air', seats: [150, 172, 189] },
  { code: 'V3L', name: 'Velbrook Airways', seats: [76, 76, 120] },
  { code: 'C5R', name: 'Corvanta', seats: [180, 230, 196] },
  { code: 'S2K', name: 'Skelmira Jet', seats: [146, 166, 186] },
  { code: 'T4V', name: 'Tavoro Air', seats: [76, 88, 126] },
  { code: 'Q8F', name: 'Quillfen Express', seats: [50, 70, 76] },
];
const CITIES = [['Denver', 'DEN'], ['Atlanta', 'ATL'], ['Dallas/Fort Worth', 'DFW'], ['New York', 'LGA'], ['Boston', 'BOS'], ['Phoenix', 'PHX'], ['Seattle', 'SEA'], ['Orlando', 'MCO'], ['Miami', 'MIA'], ['Minneapolis', 'MSP'], ['Nashville', 'BNA'], ['Charlotte', 'CLT'], ['Las Vegas', 'LAS'], ['Toronto', 'YYZ'], ['Mexico City', 'MEX'], ['San Francisco', 'SFO'], ['Detroit', 'DTW'], ['Houston', 'IAH'], ['Austin', 'AUS'], ['Washington DC', 'DCA'], ['Kansas City', 'MCI'], ['Omaha', 'OMA'], ['Indianapolis', 'IND'], ['Pittsburgh', 'PIT']];
const CONC = ['B', 'C', 'E', 'F', 'H', 'K'];

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296); }
const MIN = 60e3;

// Flights are laid out on a fixed 15-minute grid anchored to the clock, so a row keeps its
// identity as time passes (it scrolls up the board, changes status, then drops off).
function slotFlights(kind, now, { spanBefore, spanAfter }) {
  const grid = 15 * MIN; const first = Math.floor((now - spanBefore) / grid), last = Math.ceil((now + spanAfter) / grid);
  const out = [];
  for (let g = first; g <= last; g++) {
    const r = rng(g * 2654435761 ^ (kind === 'arr' ? 0x51ed : 0x0d3a));
    // A heavier bank every 2 hours (index 6..7 of each 8-slot cycle) for the arrival forecast to find.
    const bank = ((g % 8) + 8) % 8 >= 6; const n = kind === 'arr' ? (bank ? 4 : 1 + (r() < 0.5)) : 2 + (r() < 0.4);
    for (let k = 0; k < n; k++) {
      const al = AIRLINES[Math.floor(r() * AIRLINES.length)]; const sched = g * grid + Math.floor(r() * 15) * MIN;
      const [city, apt] = CITIES[Math.floor(r() * CITIES.length)]; const num = 100 + Math.floor(r() * 2800);
      const rd = r(); const delay = rd < 0.18 ? 10 + Math.floor(r() * 5) * 10 : kind === 'arr' && rd < 0.3 ? -(5 + Math.floor(r() * 3) * 5) : 0; const cancelled = r() < 0.03;
      out.push({ id: `${kind}-${g}-${k}`, airline: al.name, code: al.code, flight: `${al.code} ${num}`, city, apt, sched, delayMin: delay, cancelled, gate: CONC[Math.floor(r() * CONC.length)] + (1 + Math.floor(r() * 24)), seats: al.seats[Math.floor(r() * al.seats.length)], sample: true });
    }
  }
  return out.sort((a, b) => a.sched - b.sched);
}

// Scripted sample "updates" so the board changes every few seconds like a real feed would.
function applyScenario(rows, now, salt) {
  const tick = Math.floor(now / 12000); // one sample update every 12 s
  const live = rows.filter((f) => !f.cancelled && f.sched > now + 20 * MIN);
  for (let t = tick - 5; t <= tick; t++) { // keep the last 5 updates applied, so changes persist ~1 min
    const r = rng(t * 97 + salt); const f = live[Math.floor(r() * live.length)]; if (!f) continue;
    const roll = r();
    if (roll < 0.35) f.delayMin = f.delayMin > 0 ? 0 : 15 + Math.floor(r() * 4) * 10; // delay posted / cleared
    else if (roll < 0.6) f.delayMin = Math.max(0, f.delayMin) + 10; // delay extended
    else { const g = CONC[Math.floor(r() * CONC.length)] + (1 + Math.floor(r() * 24)); if (g !== f.gate) { f.prevGate = f.gate; f.gate = g; f.gateChangedAt = t * 12000; } } // gate change
    f.changedAt = t * 12000;
  }
  return rows;
}

export function sampleArrivals(now = Date.now()) {
  return applyScenario(slotFlights('arr', now, { spanBefore: 40 * MIN, spanAfter: 200 * MIN }), now, 11).map((f) => {
    const est = f.sched + f.delayMin * MIN; let status = 'On time';
    if (f.cancelled) status = 'Cancelled'; else if (est <= now) status = 'Landed'; else if (f.delayMin >= 15) status = 'Delayed'; else if (f.delayMin < 0) status = 'Early'; else if (est - now > 90 * MIN) status = 'Scheduled';
    return { ...f, est, status };
  }).filter((f) => f.est > now - 30 * MIN);
}

export function sampleDepartures(now = Date.now()) {
  return applyScenario(slotFlights('dep', now, { spanBefore: 20 * MIN, spanAfter: 200 * MIN }), now, 23).map((f) => {
    f.delayMin = Math.max(0, f.delayMin); const est = f.sched + f.delayMin * MIN; const toGo = (est - now) / MIN; let status = 'On time';
    if (f.cancelled) status = 'Cancelled'; else if (toGo <= 0) status = 'Departed'; else if (toGo <= 15) status = 'Final call'; else if (toGo <= 40) status = 'Boarding'; else if (f.delayMin >= 15) status = 'Delayed'; else if (toGo > 90) status = 'Scheduled';
    const boardAt = est - 40 * MIN;
    return { ...f, est, status, boardAt };
  }).filter((f) => f.est > now - 3 * MIN);
}
