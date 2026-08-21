// Short audio cues for the door scanner. We synthesize tones with WebAudio
// so we don't ship audio assets. The first call must come from a user gesture
// (PIN unlock) so the AudioContext is allowed to start.

let ctx: AudioContext | null = null;

function ensureCtx() {
  if (!ctx) {
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (Ctor) ctx = new Ctor();
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}

function beep(freq: number, durationMs: number, type: OscillatorType = "sine", gain = 0.15) {
  const ac = ensureCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + durationMs / 1000);
}

export function unlockAudio() {
  ensureCtx();
}

export function chimeOk() {
  beep(880, 110, "sine", 0.22);
  setTimeout(() => beep(1320, 140, "sine", 0.22), 90);
  setTimeout(() => beep(1760, 160, "sine", 0.2), 220);
}
export function chimeWarning() {
  // Distinct two-tone "uh-oh" descending — clearly different from success
  beep(740, 180, "square", 0.22);
  setTimeout(() => beep(440, 260, "square", 0.22), 160);
  setTimeout(() => beep(440, 200, "square", 0.2), 460);
}
export function chimeError() {
  // Harsh low buzz — three pulses
  beep(180, 200, "sawtooth", 0.28);
  setTimeout(() => beep(140, 220, "sawtooth", 0.28), 220);
  setTimeout(() => beep(110, 280, "sawtooth", 0.3), 470);
}

export function vibrate(pattern: number | number[]) {
  if ("vibrate" in navigator) {
    try { (navigator as any).vibrate(pattern); } catch {}
  }
}
