/* =====================================================================
 * Sound Effects — synthesized via Web Audio API at runtime.
 * No external MP3 files needed → fast load, smaller bundle, PWA-friendly.
 * Respects a global user toggle (localStorage key `mondial26.sound`).
 * ===================================================================*/

export type SfxName =
  | "click"      // soft tap
  | "save"       // success chime
  | "achievement"// fanfare
  | "goal"       // crowd roar synthetic
  | "whistle"    // referee whistle
  | "notify"     // notification ping
  | "lock";      // soft locking thud

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("mondial26.sound") !== "off";
}

export function setSoundEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem("mondial26.sound", on ? "on" : "off");
}

function envelope(g: GainNode, a: AudioContext, peak: number, attack = 0.005, hold = 0.05, decay = 0.18) {
  const t = a.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.linearRampToValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.001, t + attack + hold + decay);
}

function tone(a: AudioContext, freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; detune?: number; sweepTo?: number } = {}) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type || "sine";
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (opts.sweepTo) o.frequency.exponentialRampToValueAtTime(opts.sweepTo, a.currentTime + dur);
  if (opts.detune) o.detune.value = opts.detune;
  o.connect(g);
  g.connect(a.destination);
  envelope(g, a, opts.gain ?? 0.15, 0.005, dur * 0.4, dur * 0.5);
  o.start();
  o.stop(a.currentTime + dur + 0.05);
}

function noiseBurst(a: AudioContext, dur: number, gain = 0.15) {
  const bufferSize = a.sampleRate * dur;
  const buffer = a.createBuffer(1, bufferSize, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const g = a.createGain();
  src.connect(g); g.connect(a.destination);
  envelope(g, a, gain, 0.005, dur * 0.3, dur * 0.6);
  src.start();
}

export function playSound(name: SfxName) {
  if (!soundEnabled()) return;
  const a = ensureCtx();
  if (!a) return;
  switch (name) {
    case "click":
      tone(a, 880, 0.05, { type: "triangle", gain: 0.10 });
      break;
    case "save":
      tone(a, 660, 0.10, { type: "sine", gain: 0.12 });
      setTimeout(() => tone(a, 880, 0.15, { type: "sine", gain: 0.14 }), 70);
      break;
    case "achievement":
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(a, f, 0.2, { type: "triangle", gain: 0.18 }), i * 90));
      break;
    case "goal":
      // crowd roar = filtered noise + low rumble + ascending tone
      noiseBurst(a, 0.8, 0.20);
      tone(a, 90, 0.7, { type: "sawtooth", gain: 0.12 });
      tone(a, 440, 0.6, { type: "square", gain: 0.10, sweepTo: 880 });
      break;
    case "whistle":
      tone(a, 2400, 0.18, { type: "square", gain: 0.08 });
      tone(a, 2400, 0.18, { type: "sine",   gain: 0.10 });
      break;
    case "notify":
      tone(a, 1320, 0.10, { type: "sine", gain: 0.12 });
      setTimeout(() => tone(a, 1760, 0.12, { type: "sine", gain: 0.12 }), 80);
      break;
    case "lock":
      tone(a, 220, 0.18, { type: "sawtooth", gain: 0.14, sweepTo: 110 });
      break;
  }
}

/* Reactive components can subscribe to sound preferences */
export function useSoundToggle() {
  // Lazy hook — only available in client components
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useState, useEffect } = require("react");
  const [on, setOn] = useState<boolean>(soundEnabled());
  useEffect(() => {
    const h = () => setOn(soundEnabled());
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);
  return {
    on,
    toggle: () => { const next = !on; setSoundEnabled(next); setOn(next); if (next) playSound("click"); },
  };
}
