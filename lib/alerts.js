// Front-desk alert messages (text). Our own code
// Builds the SMS-length text for each trigger. DELIVERY IS NOT CONNECTED in phase 0: there is no
// SMS provider at $0 (US A2P SMS needs a paid provider and 10DLC registration). The player shows
// these as "Alert preview"; a later phase plugs in web push / email / Slack (free) or SMS (paid).
// Messages use GSM-7 characters only and stay within one 160-character SMS segment.
const GSM7 = /^[A-Za-z0-9 @$_!"#%&'()*+,\-./:;<=>?\n]*$/;
const clip = (s) => (s.length <= 160 ? s : s.slice(0, 157) + '...');
export function shuttleArriving({ van = 'Van 1', property = 'the hotel', etaS }) {
  const when = etaS < 45 ? 'now' : `in about ${Math.max(1, Math.round(etaS / 60))} min`;
  return msg('shuttle', `${van} arriving at ${property} front entrance ${when} (GPS estimate).`);
}
export function arrivalWave({ start, end, flights, guests, curbFrom }) {
  return msg('wave', `Heads up: heavy arrivals ${start}-${end}, ${flights} flights, about ${guests} guests (estimate). Shuttle demand likely from ${curbFrom}.`);
}
export function faaDelay({ airport, kind, avgMin, weather }) {
  return msg('faa', `FAA ${kind.toLowerCase()} at ${airport}${avgMin ? `, avg ${avgMin} min` : ''}${weather ? ' (weather)' : ''}. Expect late arrivals and late check-ins.`);
}
export function weatherAlert({ event, ends }) { return msg('weather', `NWS ${event}${ends ? ` until ${ends}` : ''} near the airport. Check shuttle timing.`); }
function msg(kind, text) {
  const t = clip(text.replace(/[–—]/g, '-').replace(/[’]/g, "'"));
  return { kind, text: t, chars: t.length, gsm7: GSM7.test(t), segments: 1, delivery: 'not connected (preview only)' };
}
