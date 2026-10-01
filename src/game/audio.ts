let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;
let wired = false;

function contextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || w.webkitAudioContext || null;
}

export function unlockAudio() {
  const AC = contextCtor();
  if (!AC) return;
  if (!ctx) {
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    sfxBus.gain.value = 0.75;
    musicBus.gain.value = 0;
    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(ctx.destination);
    startPad();
    musicBus.gain.linearRampToValueAtTime(muted ? 0 : 0.2, ctx.currentTime + 1.6);
  }
  if (ctx.state === "suspended") void ctx.resume();
  if (!wired) {
    wired = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && ctx && ctx.state === "suspended") {
        void ctx.resume();
      }
    });
  }
}

function startPad() {
  if (!ctx || !musicBus) return;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  filter.connect(musicBus);
  const tones = [
    { f: 110, g: 0.05 },
    { f: 164.81, g: 0.03 },
    { f: 220, g: 0.02 },
  ];
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tone.f;
    gain.gain.value = tone.g;
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
  }
}

export function setMuted(next: boolean) {
  muted = next;
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.03);
}

export function isMuted() {
  return muted;
}

function envGain(peak: number, dur: number) {
  if (!ctx || !sfxBus) return null;
  const t = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  gain.connect(sfxBus);
  return { gain, t };
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  slide?: number,
) {
  if (!ctx || muted) return;
  const shaped = envGain(peak, dur);
  if (!shaped) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, shaped.t);
  if (slide) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), shaped.t + dur);
  }
  osc.connect(shaped.gain);
  osc.start(shaped.t);
  osc.stop(shaped.t + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    shaped.gain.disconnect();
  };
}

function noise(dur: number, peak: number) {
  if (!ctx || !sfxBus || muted) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const shaped = envGain(peak, dur);
  if (!shaped) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 900;
  src.connect(filter);
  filter.connect(shaped.gain);
  src.start(shaped.t);
  src.stop(shaped.t + dur);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    shaped.gain.disconnect();
  };
}

export function playEvent(name: string) {
  if (!ctx || muted) return;
  const wobble = 0.94 + Math.random() * 0.12;
  if (name === "shoot:toot" && Math.random() < 0.4) return;
  switch (name) {
    case "shoot:harry":
      tone(520 * wobble, 0.09, "sine", 0.07, 220);
      break;
    case "shoot:murphy":
      noise(0.05, 0.08);
      tone(180, 0.04, "square", 0.03);
      break;
    case "shoot:michael":
      tone(196 * wobble, 0.14, "triangle", 0.08, 90);
      break;
    case "shoot:bob":
      tone(640 * wobble, 0.12, "sine", 0.05, 420);
      break;
    case "shoot:toot":
      tone(880 * wobble, 0.04, "square", 0.03);
      break;
    case "kill":
      tone(523, 0.07, "sine", 0.06);
      tone(784, 0.1, "sine", 0.05);
      break;
    case "leak":
      tone(110, 0.28, "sawtooth", 0.06, 55);
      break;
    case "place":
      tone(180, 0.08, "triangle", 0.06, 320);
      break;
    case "upgrade":
      tone(392, 0.08, "sine", 0.06);
      tone(523, 0.1, "sine", 0.05);
      tone(659, 0.14, "sine", 0.05);
      break;
    case "sell":
      tone(330, 0.08, "triangle", 0.05, 180);
      break;
    case "deny":
      tone(140, 0.08, "square", 0.04);
      break;
    case "wave":
      tone(146, 0.22, "sawtooth", 0.05, 220);
      break;
    case "waveclear":
      tone(392, 0.1, "sine", 0.05);
      tone(494, 0.14, "sine", 0.04);
      break;
    case "boss":
      tone(73, 0.4, "sawtooth", 0.07, 49);
      break;
    case "victory":
      tone(392, 0.12, "sine", 0.06);
      tone(494, 0.14, "sine", 0.05);
      tone(587, 0.2, "sine", 0.05);
      break;
    case "defeat":
      tone(233, 0.16, "triangle", 0.06, 110);
      tone(174, 0.28, "sine", 0.05);
      break;
    default:
      break;
  }
}
