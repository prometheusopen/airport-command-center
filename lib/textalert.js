// TextAlert: how front-desk manager texts would go out. Phase 0 ships only the preview sink.
//   interface TextAlert { id; enabled; send({ to, text }) -> { delivered, id?, reason? } }
// Recipients are front-desk managers only, never guests. The Twilio adapter is a DISABLED stub:
// it holds no credentials and never makes a request. Turning it on needs a Twilio account,
// a number, US A2P 10DLC registration, and a written OK. Until then nothing is sent.
export class PreviewSink {
  id = 'preview'; enabled = true; log = [];
  async send({ to = 'front-desk', text, kind }) { const m = { to, text, kind, at: Date.now(), delivered: false, reason: 'preview only: SMS delivery not connected' }; this.log.unshift(m); this.log = this.log.slice(0, 50); return m; }
}
export class TwilioTextAlert {
  id = 'twilio'; enabled = false; implemented = false;
  async send() { return { delivered: false, reason: 'Twilio adapter disabled: stub, no account, no written OK' }; }
}
export function textAlertFrom(cfg = {}) {
  // Even if config asks for twilio, the stub stays disabled; the preview sink always records.
  const preview = new PreviewSink(); const twilio = new TwilioTextAlert();
  return { preview, twilio, channel: cfg.TEXT_ALERTS === 'twilio' ? twilio : preview, async send(m) { const r = await preview.send(m); if (cfg.TEXT_ALERTS === 'twilio') r.twilio = await twilio.send(m); return r; } };
}
