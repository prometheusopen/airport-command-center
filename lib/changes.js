// Flight-change detection: diff two board snapshots into alert events (delay posted/extended,
// cancellation, gate change, early arrival). Used for the on-screen highlights and front-desk alerts.
export function flightChanges(prev = [], next = []) {
  const before = new Map(prev.map((f) => [f.id, f])); const out = [];
  for (const f of next) {
    const p = before.get(f.id); if (!p) continue;
    if (!p.cancelled && f.cancelled) out.push({ type: 'cancelled', flight: f.flight, city: f.city });
    if (p.gate !== f.gate) out.push({ type: 'gate', flight: f.flight, city: f.city, from: p.gate, to: f.gate });
    if ((f.delayMin || 0) >= 15 && (f.delayMin || 0) > (p.delayMin || 0)) out.push({ type: 'delay', flight: f.flight, city: f.city, delayMin: f.delayMin });
    if ((f.delayMin || 0) < 0 && (p.delayMin || 0) >= 0) out.push({ type: 'early', flight: f.flight, city: f.city, earlyMin: -f.delayMin });
  }
  return out;
}
export function changeText(c) {
  return { cancelled: `${c.flight} from/to ${c.city} cancelled.`, gate: `${c.flight} (${c.city}) gate changed ${c.from} to ${c.to}.`, delay: `${c.flight} (${c.city}) delayed ${c.delayMin} min.`, early: `${c.flight} from ${c.city} arriving ${c.earlyMin} min early.` }[c.type];
}
// Which changes are worth a front-desk text: cancellations and delays of 30+ min on arrivals.
export const frontDeskChanges = (changes) => changes.filter((c) => c.type === 'cancelled' || (c.type === 'delay' && c.delayMin >= 30));
