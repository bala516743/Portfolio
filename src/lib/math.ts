import * as THREE from "three";

/**
 * Motion primitives.
 *
 * Everything that moves in this experience moves through one of these.
 * The rule: no linear interpolation against a fixed alpha, ever — that is
 * frame-rate dependent and reads as "cheap web animation". We use
 * exponential decay against delta time so a 144Hz monitor and a throttled
 * laptop settle along the identical curve.
 */

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number) =>
  a === b ? 0 : clamp((v - a) / (b - a), 0, 1);

/** Remap with clamping. */
export const remap = (v: number, inA: number, inB: number, outA: number, outB: number) =>
  lerp(outA, outB, invLerp(inA, inB, v));

/**
 * Frame-rate independent exponential damping.
 * `lambda` is roughly "how many e-foldings per second" — higher is snappier.
 * 1 ≈ syrupy, 4 ≈ responsive, 10 ≈ almost immediate.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  THREE.MathUtils.damp(current, target, lambda, dt);

const _v = new THREE.Vector3();

export function damp3(
  current: THREE.Vector3,
  target: THREE.Vector3,
  lambda: number,
  dt: number
) {
  const f = 1 - Math.exp(-lambda * dt);
  current.lerp(_v.copy(target), f);
  return current;
}

export function dampQ(
  current: THREE.Quaternion,
  target: THREE.Quaternion,
  lambda: number,
  dt: number
) {
  current.slerp(target, 1 - Math.exp(-lambda * dt));
  return current;
}

/** Shortest-path angular damping — stops the -179° → 179° whip. */
export function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

/**
 * A real critically-damped spring with velocity carry-over.
 * Used where a movement needs *momentum* and *settling* rather than a
 * pure ease — button presses, landing gear, panel cards.
 */
export class Spring {
  value: number;
  velocity = 0;
  constructor(
    value = 0,
    /** angular frequency — higher is stiffer */
    public stiffness = 12,
    /** 1 = critically damped, <1 = bouncy overshoot, >1 = sluggish */
    public damping = 1
  ) {
    this.value = value;
  }
  step(target: number, dt: number) {
    // Semi-implicit Euler, clamped so a tab-out frame spike can't explode it.
    const h = Math.min(dt, 1 / 30);
    const k = this.stiffness * this.stiffness;
    const c = 2 * this.damping * this.stiffness;
    const a = -k * (this.value - target) - c * this.velocity;
    this.velocity += a * h;
    this.value += this.velocity * h;
    return this.value;
  }
}

/* ------------------------------------------------------------------ */
/* EASINGS — anticipation, follow-through, settle                      */
/* ------------------------------------------------------------------ */

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const easeInCubic = (t: number) => t * t * t;

export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

export const easeInOutQuint = (t: number) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeOutElastic = (t: number) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

/** Anticipate: pull back slightly before launching forward. */
export const easeAnticipate = (t: number) => {
  const s = 1.9;
  return t * t * ((s + 1) * t - s);
};

/**
 * The workhorse flight ease: a long, slow acceleration, a confident cruise,
 * then a very long settle. Nintendo camera moves live here.
 */
export const easeFlight = (t: number) => {
  const e = easeInOutQuint(t);
  // Blend a touch of cubic back in so the cruise isn't unnaturally flat.
  return e * 0.82 + easeInOutCubic(t) * 0.18;
};

/**
 * Cruise ease — a trapezoidal *velocity* profile, not a position curve.
 *
 * This is the difference between an aeroplane and a slingshot. Every
 * symmetric ease (quint, cubic, sine) reaches its peak speed at the midpoint:
 * easeInOutQuint peaks at ~2.5x its average, so the middle of a long flight
 * rockets past and the ends crawl. Here the speed ramps up over `a`, holds
 * *flat* through the middle, and ramps down over `b` — peak is only ~1.3x
 * average, which reads as a steady cruise with gentle ends.
 *
 * Returned value is normalised distance travelled at time t.
 */
export const easeCruise = (t: number, a = 0.16, b = 0.26) => {
  const total = 1 - a / 2 - b / 2; // area under the trapezoid
  let d: number;
  if (t < a) {
    // Accelerating: integral of smoothstep(0..a).
    const x = t / a;
    d = a * (x * x * x - (x * x * x * x) / 2);
  } else if (t < 1 - b) {
    // Constant speed.
    d = a / 2 + (t - a);
  } else {
    // Decelerating: integral of (1 - smoothstep) over the tail.
    const u = t - (1 - b);
    const y = u / b;
    d = a / 2 + (1 - b - a) + u - b * (y * y * y - (y * y * y * y) / 2);
  }
  return clamp(d / total, 0, 1);
};

/* ------------------------------------------------------------------ */
/* NOISE — cheap, deterministic, allocation-free                       */
/* ------------------------------------------------------------------ */

/** Layered sines. Not Perlin, but wind and bobbing don't need Perlin. */
export const wobble = (t: number, seed = 0) =>
  Math.sin(t * 1.1 + seed * 12.9898) * 0.6 +
  Math.sin(t * 2.3 + seed * 78.233) * 0.3 +
  Math.sin(t * 4.7 + seed * 43.758) * 0.1;

/** Deterministic 0..1 hash — stable positions across reloads. */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Deterministic point on a disc, evenly distributed. */
export const discPoint = (i: number, seed = 0) => {
  const r = Math.sqrt(hash(i * 2.1 + seed));
  const a = hash(i * 3.7 + seed + 91.3) * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r] as const;
};
