"use client";

/**
 * Procedural audio.
 *
 * Every sound in this experience is synthesised at runtime — there is not a
 * single audio file to download. That keeps the payload at zero bytes and,
 * more usefully, lets the engine note bend continuously with the throttle
 * instead of crossfading between canned loops.
 *
 * Nothing starts until a real user gesture, per autoplay policy.
 */

type Nodes = {
  ctx: AudioContext;
  master: GainNode;
  musicBus: GainNode;
  sfxBus: GainNode;
  space: DelayNode;
  spaceFb: GainNode;
};

let N: Nodes | null = null;
let started = false;
let musicTimer: number | null = null;
let engine: {
  osc: OscillatorNode;
  sub: OscillatorNode;
  noise: AudioBufferSourceNode;
  gain: GainNode;
  noiseGain: GainNode;
  filter: BiquadFilterNode;
} | null = null;
let rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let clock: number | null = null;

/* ------------------------------------------------------------------ */

function noiseBuffer(ctx: AudioContext, seconds = 2) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Slightly brown-tinted noise — pure white is harsh over long exposure.
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

export function initAudio() {
  if (N || typeof window === "undefined") return N;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const musicBus = ctx.createGain();
  musicBus.gain.value = 0.32;
  musicBus.connect(master);

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(master);

  // A cheap sense of room: feedback delay, heavily damped.
  const space = ctx.createDelay(1.2);
  space.delayTime.value = 0.28;
  const spaceFb = ctx.createGain();
  spaceFb.gain.value = 0.34;
  const spaceLp = ctx.createBiquadFilter();
  spaceLp.type = "lowpass";
  spaceLp.frequency.value = 1900;
  space.connect(spaceLp);
  spaceLp.connect(spaceFb);
  spaceFb.connect(space);
  const spaceOut = ctx.createGain();
  spaceOut.gain.value = 0.5;
  spaceLp.connect(spaceOut);
  spaceOut.connect(master);

  N = { ctx, master, musicBus, sfxBus, space, spaceFb };
  return N;
}

/** Call from a real click/tap. Safe to call repeatedly. */
export async function startAudio() {
  const n = initAudio();
  if (!n) return;
  if (n.ctx.state === "suspended") await n.ctx.resume();
  if (started) return;
  started = true;
  n.master.gain.cancelScheduledValues(n.ctx.currentTime);
  n.master.gain.setValueAtTime(0.0001, n.ctx.currentTime);
  n.master.gain.exponentialRampToValueAtTime(0.9, n.ctx.currentTime + 2.4);
  startEngine();
  startMusic();
}

export function setMuted(muted: boolean) {
  if (!N) return;
  const { ctx, master } = N;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(muted ? 0.0001 : 0.9, ctx.currentTime, 0.25);
}

/* ------------------------------------------------------------------ */
/* ENGINE — one continuous voice, bent by throttle                     */
/* ------------------------------------------------------------------ */

function startEngine() {
  if (!N || engine) return;
  const { ctx, sfxBus } = N;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  filter.Q.value = 3.2;

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 62;

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 31;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.5;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 2);
  noise.loop = true;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 1200;
  noiseFilter.Q.value = 0.7;

  osc.connect(filter);
  sub.connect(subGain);
  subGain.connect(filter);
  filter.connect(gain);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(gain);
  gain.connect(sfxBus);

  osc.start();
  sub.start();
  noise.start();

  engine = { osc, sub, noise, gain, noiseGain, filter };
}

/**
 * Called every frame from the render loop. `throttle` 0..1, `speed` in m/s.
 * setTargetAtTime rather than setValueAtTime so the note glides — a stepped
 * engine pitch is the single most obvious "this is a web page" tell.
 */
export function updateEngine(throttle: number, speed: number) {
  if (!engine || !N) return;
  const t = N.ctx.currentTime;
  const rpm = 58 + throttle * 96 + Math.min(speed, 70) * 0.55;
  engine.osc.frequency.setTargetAtTime(rpm, t, 0.09);
  engine.sub.frequency.setTargetAtTime(rpm * 0.5, t, 0.09);
  engine.filter.frequency.setTargetAtTime(420 + throttle * 1500, t, 0.12);
  engine.gain.gain.setTargetAtTime(throttle * 0.16, t, 0.14);
  engine.noiseGain.gain.setTargetAtTime(throttle * 0.1 + Math.min(speed, 60) * 0.0018, t, 0.16);
}

/* ------------------------------------------------------------------ */
/* MUSIC — generative, pentatonic, never repeats exactly               */
/* ------------------------------------------------------------------ */

/** A major pentatonic, two octaves. Impossible to make sound wrong. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const ROOT = 261.63; // C4
const noteHz = (deg: number) => ROOT * Math.pow(2, SCALE[deg % SCALE.length] / 12) * (deg >= SCALE.length ? 1 : 1);

let step = 0;

function pluck(freq: number, at: number, dur: number, vol: number, type: OscillatorType = "triangle") {
  if (!N) return;
  const { ctx, musicBus, space } = N;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(3800, at);
  f.frequency.exponentialRampToValueAtTime(800, at + dur);
  o.connect(f);
  f.connect(g);
  g.connect(musicBus);
  g.connect(space);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function pad(at: number, dur: number) {
  if (!N) return;
  const { ctx, musicBus } = N;
  [0, 4, 7].forEach((semi, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = (ROOT / 2) * Math.pow(2, semi / 12);
    o.detune.value = (i - 1) * 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05, at + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(musicBus);
    o.start(at);
    o.stop(at + dur + 0.1);
  });
}

function startMusic() {
  if (!N || musicTimer !== null) return;
  const { ctx } = N;
  const beat = 0.42;
  let next = ctx.currentTime + 0.2;

  const tick = () => {
    if (!N) return;
    while (next < N.ctx.currentTime + 0.6) {
      const bar = Math.floor(step / 8);
      const inBar = step % 8;

      if (inBar === 0) pad(next, beat * 8);

      // A wandering melody — the degree drifts rather than looping a riff.
      if (inBar % 2 === 0 || Math.random() > 0.55) {
        const deg = 2 + ((Math.sin(step * 0.7) * 3 + Math.sin(bar * 1.3) * 2 + 3) | 0);
        pluck(noteHz(Math.max(0, Math.min(SCALE.length - 1, deg))), next, 1.4, 0.09);
      }
      if (inBar === 4) {
        pluck(noteHz(0) * 0.5, next, 1.9, 0.07, "sine");
      }
      next += beat;
      step++;
    }
    musicTimer = window.setTimeout(tick, 220);
  };
  tick();
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}

/** Ducks the music under a big moment, then brings it back. */
export function duckMusic(amount = 0.35, seconds = 1.6) {
  if (!N) return;
  const { ctx, musicBus } = N;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(0.32 * amount, ctx.currentTime, 0.15);
  musicBus.gain.setTargetAtTime(0.32, ctx.currentTime + seconds, 0.6);
}

/* ------------------------------------------------------------------ */
/* ONE-SHOTS                                                           */
/* ------------------------------------------------------------------ */

function env(dur: number, vol: number) {
  const { ctx, sfxBus } = N!;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(sfxBus);
  return { g, t };
}

export function sfx(
  name:
    | "click"
    | "hover"
    | "whoosh"
    | "chime"
    | "land"
    | "power"
    | "stamp"
    | "unfold"
    | "star"
    | "firework"
    | "tick"
) {
  if (!N || !started) return;
  const { ctx, space } = N;

  switch (name) {
    case "hover": {
      const { g, t } = env(0.09, 0.05);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.12);
      break;
    }
    case "click": {
      const { g, t } = env(0.16, 0.16);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(880, t + 0.06);
      o.connect(g);
      g.connect(space);
      o.start(t);
      o.stop(t + 0.2);
      break;
    }
    case "unfold": {
      const { g, t } = env(0.5, 0.09);
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, 0.6);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(3400, t + 0.45);
      f.Q.value = 1.6;
      s.connect(f);
      f.connect(g);
      s.start(t);
      s.stop(t + 0.6);
      break;
    }
    case "whoosh": {
      const { g, t } = env(1.0, 0.14);
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, 1.2);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 1.1;
      f.frequency.setValueAtTime(240, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.4);
      f.frequency.exponentialRampToValueAtTime(180, t + 1.0);
      s.connect(f);
      f.connect(g);
      g.connect(space);
      s.start(t);
      s.stop(t + 1.2);
      break;
    }
    case "land": {
      const { g, t } = env(0.42, 0.3);
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.45);
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, 0.5);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.14, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 900;
      s.connect(f);
      f.connect(sg);
      sg.connect(N.sfxBus);
      s.start(t);
      s.stop(t + 0.5);
      break;
    }
    case "power": {
      const { g, t } = env(0.7, 0.13);
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(80, t);
      o.frequency.exponentialRampToValueAtTime(420, t + 0.5);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(4200, t + 0.55);
      o.connect(f);
      f.connect(g);
      g.connect(space);
      o.start(t);
      o.stop(t + 0.8);
      break;
    }
    case "chime":
    case "star": {
      const base = name === "star" ? 880 : 660;
      [0, 4, 7, 12].forEach((semi, i) => {
        const t = ctx.currentTime + i * 0.055;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = base * Math.pow(2, semi / 12);
        o.connect(g);
        g.connect(N!.sfxBus);
        g.connect(space);
        o.start(t);
        o.stop(t + 1.2);
      });
      break;
    }
    case "stamp": {
      const { g, t } = env(0.3, 0.4);
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.22);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1400;
      o.connect(f);
      f.connect(g);
      o.start(t);
      o.stop(t + 0.35);
      break;
    }
    case "firework": {
      const t = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(3000, t + 1.0);
      s.connect(f);
      f.connect(g);
      g.connect(N.sfxBus);
      g.connect(space);
      s.start(t);
      s.stop(t + 1.4);
      break;
    }
    case "tick": {
      const { g, t } = env(0.05, 0.035);
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, 0.08);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 2600;
      f.Q.value = 6;
      s.connect(f);
      f.connect(g);
      s.start(t);
      s.stop(t + 0.08);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* AMBIENCE                                                            */
/* ------------------------------------------------------------------ */

export function setRainAudio(on: boolean) {
  if (!N || !started) return;
  const { ctx, sfxBus } = N;
  if (on && !rain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 3);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(f);
    f.connect(gain);
    gain.connect(sfxBus);
    src.start();
    gain.gain.setTargetAtTime(0.09, ctx.currentTime, 0.9);
    rain = { src, gain };
  } else if (!on && rain) {
    const r = rain;
    rain = null;
    r.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.7);
    setTimeout(() => {
      try {
        r.src.stop();
      } catch {
        /* already stopped */
      }
    }, 2500);
  }
}

/** Ambient ticking clock. Unused by the current opening; kept for reuse. */
export function setClock(on: boolean) {
  if (on && clock === null) {
    clock = window.setInterval(() => sfx("tick"), 1000);
  } else if (!on && clock !== null) {
    clearInterval(clock);
    clock = null;
  }
}

export function disposeAudio() {
  stopMusic();
  setClock(false);
  setRainAudio(false);
  if (N) {
    N.ctx.close().catch(() => {});
    N = null;
  }
  engine = null;
  started = false;
}
