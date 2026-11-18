// Ad/special rotation used by the player. Apache-2.0.
// Player-side rotation: which items are in their time window now (property local time), with
// weight = how many times an item appears per cycle.
export function activeRotation(playlist, date, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(date).map((p) => [p.type, p.value]));
  const hhmm = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`; const day = parts.weekday.toLowerCase().slice(0, 3);
  const on = playlist.items.filter((i) => i.days.includes(day) && hhmm >= i.window[0] && hhmm < i.window[1]);
  const out = []; for (const i of on) for (let k = 0; k < i.weight; k++) out.push(i);
  return out;
}
