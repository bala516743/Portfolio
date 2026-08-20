"use client";

import * as THREE from "three";
import {
  clamp,
  damp,
  dampAngle,
  easeCruise,
  easeInOutCubic,
  easeOutCubic,
  hash,
  lerp,
  wobble,
  Spring,
} from "./math";
import { ISLANDS, ISLAND_MAP, islandBob, padWorld, WORLD_CENTER, type IslandId } from "@/data/world";
import { useGame } from "./store";
import { input, sampleInput, idleFor } from "./input";

/**
 * The flight system.
 *
 * The pilot flies the aeroplane. This is a hand-tuned arcade flight model —
 * not a simulator — built so that every control input arrives through
 * exponential damping rather than as an instant change. Nothing here snaps:
 * throttle spools, turns build and unwind with inertia, the bank angle
 * follows the *actual* turn rate rather than the key being held, and the
 * aeroplane keeps drifting for a moment after you let go.
 *
 * Takeoff and landing are scripted and hand control back to `free`. Warp is
 * a separate mode: selecting a destination folds the aeroplane away and
 * reassembles it there, rather than steering it across the map.
 */

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1); // three.js convention: models face -Z

/* ------------------------------------------------------------------ */
/* Flight model constants — every one of these is a feel decision       */
/* ------------------------------------------------------------------ */

/** Speed with the throttle closed. The toy always glides; it never stalls. */
const GLIDE_SPEED = 5.5;
const CRUISE_SPEED = 24;
const TURBO_SPEED = 44;
/** Reverse is a slow nudge, not a manoeuvre. */
const REVERSE_SPEED = -3.5;
/** Low = syrupy acceleration. This is the single biggest "feel" number. */
const ACCEL_LAMBDA = 1.15;
const BRAKE_LAMBDA = 1.9;
/** Radians per second at full deflection. */
const TURN_RATE = 0.78;
/** How fast the turn rate itself changes — the source of turn inertia and drift. */
const TURN_LAMBDA = 2.1;
const BANK_PER_YAW = 0.85;
const BANK_MAX = 0.66;
/** Cruising height above an island's deck. */
const DECK_CLEARANCE = 13;
/** Horizontal radius of a landing zone. Generous on purpose. */
const LAND_RADIUS = 11;
/** Seconds after takeoff during which landing cannot re-trigger. */
const LAND_LOCK = 3.2;
/** Idle time before the HUD offers to jump you to your objective. */
export const IDLE_NUDGE_MS = 12000;

export type FlightMode =
  | "parked"
  | "takeoff"
  | "free"
  | "warp"
  | "landing"
  | "finale";

type Route = {
  curve: THREE.CatmullRomCurve3;
  duration: number;
  elapsed: number;
  to: IslandId | null;
  landQuat: THREE.Quaternion;
  /** Seconds of engine spool before the aeroplane actually moves. */
  hold: number;
};

export const flight = {
  mode: "parked" as FlightMode,

  /* --- aeroplane -------------------------------------------------- */
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  /** Yaw, radians. 0 = due north (-Z). */
  heading: 0,
  /** Current angular velocity, rad/s. Banking is derived from this. */
  yawRate: 0,
  bank: 0,
  pitch: 0,
  /** Metres per second along the nose. */
  speed: 0,
  /** 0..1 engine load — drives propeller, sound, smoke, lights. */
  throttle: 0,
  prop: 0,
  vy: 0,
  bob: new Spring(0, 9, 0.42),
  justLanded: 0,
  landLock: 0,

  /* --- camera ----------------------------------------------------- */
  camPos: new THREE.Vector3(),
  camLook: new THREE.Vector3(),
  camRoll: 0,
  camFov: 46,
  shake: 0,
  orbit: 0,

  /* --- navigation readouts (consumed by the HUD) ------------------- */
  /** Island we are within approach range of, if any. */
  approach: null as IslandId | null,
  approachDist: Infinity,
  /** Mission target, set by the store. */
  target: null as IslandId | null,
  targetDist: Infinity,

  /* --- warp jump --------------------------------------------------- */
  /** 0..1 through a warp. */
  warpT: 0,
  warpTo: null as IslandId | null,
  /** Visual scale of the aeroplane; folds to 0 at the midpoint. */
  visualScale: 1,
  /** Extra roll applied while folding, radians. */
  warpSpin: 0,
  /** 0..1 screen flash, read by the warp overlay. */
  warpFlash: 0,

  /* --- internals -------------------------------------------------- */
  route: null as Route | null,
  parkedAt: null as IslandId | null,
  time: 0,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _m = new THREE.Matrix4();

const horizDist = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

/** Unit forward vector for a given heading. */
function headingVec(h: number, out: THREE.Vector3) {
  return out.set(-Math.sin(h), 0, -Math.cos(h));
}

/**
 * Auto-altitude.
 *
 * The pilot has no climb/dive control by design — this is meant to be
 * relaxing. The aeroplane finds its own height as an inverse-square weighted
 * blend of every island's deck, which is continuous everywhere and therefore
 * never produces a sudden climb as you cross between two of them.
 */
function autoAltitude(pos: THREE.Vector3) {
  let wsum = 0;
  let asum = 0;
  for (const def of ISLANDS) {
    const d = Math.max(horizDist(pos, def.position), 6);
    const w = 1 / (d * d);
    wsum += w;
    asum += w * (def.position.y + DECK_CLEARANCE);
  }
  return wsum > 0 ? asum / wsum : WORLD_CENTER.y + DECK_CLEARANCE;
}

/** Nearest island and its horizontal distance. */
function nearest(pos: THREE.Vector3) {
  let best: IslandId | null = null;
  let bestD = Infinity;
  for (const def of ISLANDS) {
    const d = horizDist(pos, padWorld(def));
    if (d < bestD) {
      bestD = d;
      best = def.id;
    }
  }
  return { id: best, dist: bestD };
}

function headingQuat(h: number) {
  return new THREE.Quaternion().setFromAxisAngle(UP, h);
}

/** Rebuild `flight.quat` from heading / pitch / bank in aircraft order. */
function applyOrientation() {
  _e.set(flight.pitch, flight.heading, flight.bank, "YXZ");
  flight.quat.setFromEuler(_e);
}

/* ------------------------------------------------------------------ */
/* Route construction (takeoff, landing)                               */
/* ------------------------------------------------------------------ */

/**
 * Short flare-and-touchdown from wherever we are onto a pad.
 *
 * Every control point is clamped to the distance actually available, because
 * landing triggers when you fly *over* the pad — and a fixed 5-unit lead-in
 * along the current heading then sits past the target, forcing the curve to
 * overshoot and swing back. That was the "lands, flies away, returns" bug.
 * Here the lead-in shrinks as the pad gets closer, and the nose is blended
 * toward the pad so the path is always monotonic toward it.
 */
function buildLandingRoute(to: IslandId): Route {
  const def = ISLAND_MAP[to];
  const target = padWorld(def);
  const from = flight.pos.clone();
  const landQuat = headingQuat(def.padHeading);
  const approach = FORWARD.clone().applyQuaternion(landQuat);
  const fromDir = headingVec(flight.heading, new THREE.Vector3());

  const dist = from.distanceTo(target);
  const toPad = _v.copy(target).sub(from).normalize().clone();

  // Far away → honour the current heading. Close → aim straight at the pad.
  const keepHeading = clamp(dist / 26, 0, 1);
  const lead = fromDir.lerp(toPad, 1 - keepHeading * 0.65).normalize();

  // Never step further than a fraction of the remaining distance.
  const leadLen = Math.min(dist * 0.3, 5);
  const finalLen = Math.min(dist * 0.28, 8);
  const flareLen = Math.min(dist * 0.12, 2.6);

  const curve = new THREE.CatmullRomCurve3(
    [
      from.clone(),
      from.clone().addScaledVector(lead, leadLen).addScaledVector(UP, dist > 14 ? 0.8 : 0.2),
      target.clone().addScaledVector(approach, -finalLen).addScaledVector(UP, Math.min(dist * 0.3, 4)),
      target.clone().addScaledVector(approach, -flareLen).addScaledVector(UP, 1.5),
      target.clone().addScaledVector(UP, 0.9),
    ],
    false,
    "centripetal",
    0.5
  );

  // Scale the descent with the distance so a close landing is not rushed and
  // a distant one is not a dive.
  const duration = clamp(curve.getLength() / 7.5, 2, 5);
  return { curve, duration, elapsed: 0, to, landQuat, hold: 0 };
}

/** Lift off the pad: anticipation, then climb out along the parked heading. */
function buildTakeoffRoute(): Route {
  const from = flight.pos.clone();
  const dir = headingVec(flight.heading, new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(
    [
      from.clone(),
      from.clone().addScaledVector(dir, 5).addScaledVector(UP, 0.6),
      from.clone().addScaledVector(dir, 15).addScaledVector(UP, 5),
      from.clone().addScaledVector(dir, 30).addScaledVector(UP, 11),
    ],
    false,
    "centripetal",
    0.5
  );
  return {
    curve,
    duration: 3.1,
    elapsed: 0,
    to: null,
    landQuat: headingQuat(flight.heading),
    // Engine spools and the airframe shakes for 0.9s before anything moves.
    hold: 0.9,
  };
}

/* ------------------------------------------------------------------ */
/* Transitions                                                         */
/* ------------------------------------------------------------------ */

export function parkAt(id: IslandId) {
  flight.mode = "parked";
  flight.parkedAt = id;
  flight.route = null;
  const def = ISLAND_MAP[id];
  // Heading and speed are *not* zeroed here. The flare has already lined the
  // nose up, and updateParked damps both to rest — assigning them would put a
  // one-frame discontinuity at the exact moment the wheels touch, which is
  // the frame the player is looking at hardest.
  flight.yawRate = 0;
  // Start the orbit wherever the camera already is, so the first parked
  // frame is continuous with the last flying one.
  const off = _v.copy(flight.camPos).sub(def.position);
  flight.orbit = Math.atan2(off.z, off.x);
}

export function beginTakeoff() {
  if (flight.mode !== "parked") return;
  flight.mode = "takeoff";
  flight.route = buildTakeoffRoute();
  flight.shake = 0.8;
  flight.landLock = LAND_LOCK;
  flight.parkedAt = null;
}

export function beginLanding(to: IslandId) {
  if (flight.mode === "landing" || flight.mode === "parked") return;
  flight.mode = "landing";
  flight.route = buildLandingRoute(to);
}

/**
 * Warp to an island.
 *
 * Replaces the old auto-pilot flight. Selecting a destination is a decision,
 * not a journey: the aeroplane folds away, the world blinks, and it
 * reassembles on the far pad. Nothing can aim the wrong way because nothing
 * is being steered.
 */
export function beginWarp(to: IslandId) {
  if (flight.mode === "warp") return;
  flight.mode = "warp";
  flight.warpTo = to;
  flight.warpT = 0;
  flight.warpSpin = 0;
  flight.warpFlash = 0;
  flight.visualScale = 1;
  flight.route = null;
  // Stops the destination pad from instantly re-triggering a landing.
  flight.landLock = LAND_LOCK;
  flight.shake = 0.3;
}

/* ------------------------------------------------------------------ */
/* Frame entry point                                                   */
/* ------------------------------------------------------------------ */

let lastTick = -1;

/**
 * Frame-idempotent entry point. Both the camera rig and the aeroplane call
 * this at the top of their own frame callback; whichever runs first does the
 * integration and the other reads fresh state. Without this the plane and
 * the camera chasing it could be a frame apart, which reads as jitter.
 */
export function tickFlight(dt: number, elapsed: number) {
  if (elapsed === lastTick) return;
  lastTick = elapsed;
  updateFlight(dt, elapsed);
}

export function updateFlight(rawDt: number, elapsedTime: number) {
  flight.time = elapsedTime;
  // Clamped so a backgrounded tab returning cannot teleport anything.
  const dt = Math.min(rawDt, 1 / 15);

  sampleInput();
  const g = useGame.getState();

  flight.target = g.destination;
  if (flight.landLock > 0) flight.landLock -= dt;
  if (flight.justLanded > 0) flight.justLanded -= dt;

  updateNavigation();

  // A mode change mid-warp must not leave the toy folded or the screen lit.
  if (flight.mode !== "warp") {
    flight.visualScale = 1;
    flight.warpFlash = 0;
    flight.warpSpin = 0;
  }

  switch (flight.mode) {
    case "parked":
      updateParked(dt, elapsedTime, g.panelOpen);
      break;
    case "takeoff":
      updateScripted(dt, elapsedTime, "takeoff");
      break;
    case "free":
      updateFree(dt, elapsedTime);
      break;
    case "warp":
      updateWarp(dt, elapsedTime);
      break;
    case "landing":
      updateScripted(dt, elapsedTime, "landing");
      break;
    case "finale":
      updateFinale(dt, elapsedTime);
      break;
  }

  flight.shake = Math.max(0, flight.shake - flight.shake * 3.4 * dt - 0.05 * dt);
  flight.prop += flight.throttle * 32 * dt;
}

/** Distances and approach state, recomputed every frame for the HUD. */
function updateNavigation() {
  const n = nearest(flight.pos);
  flight.approach = n.dist < 55 ? n.id : null;
  flight.approachDist = n.dist;
  flight.targetDist = flight.target
    ? flight.pos.distanceTo(padWorld(ISLAND_MAP[flight.target]))
    : Infinity;
}

/* ------------------------------------------------------------------ */
/* PARKED                                                              */
/* ------------------------------------------------------------------ */

function updateParked(dt: number, t: number, panelOpen: boolean) {
  const id = flight.parkedAt;
  if (!id) return;
  const def = ISLAND_MAP[id];
  const pad = padWorld(def);

  const rest = flight.justLanded > 0 ? 0 : Math.sin(t * 1.25) * 0.055;
  flight.bob.step(rest, dt);
  const deck = 0.62 + flight.bob.value + islandBob(def, t);
  flight.pos.lerp(_p.copy(pad).add(_t.set(0, deck, 0)), 1 - Math.exp(-6 * dt));

  flight.heading = dampAngle(flight.heading, def.padHeading, 4, dt);
  flight.bank = damp(flight.bank, Math.sin(t * 0.8) * 0.02, 2, dt);
  flight.pitch = damp(flight.pitch, 0, 3, dt);
  flight.speed = damp(flight.speed, 0, 4, dt);
  flight.vy = 0;
  flight.yawRate = 0;
  // Ticking over, never off — the propeller keeps turning on the pad.
  flight.throttle = damp(flight.throttle, 0.12, 1.6, dt);
  applyOrientation();

  // Slow orbit. Slow enough that you feel it rather than watch it.
  flight.orbit += dt * (panelOpen ? 0.03 : 0.05);
  const focus = _lookTarget.copy(def.position).add(_p.set(0, 3.4, 0));
  const r = def.orbitRadius * (panelOpen ? 0.86 : 1);
  const h = def.orbitHeight * (panelOpen ? 0.9 : 1);
  _desired.set(
    def.position.x + Math.cos(flight.orbit) * r,
    def.position.y + h,
    def.position.z + Math.sin(flight.orbit) * r
  );

  // With the panel open, push the island off-centre so content has room and
  // the world stays visible beside it rather than behind it.
  if (panelOpen) {
    _v.copy(_desired).sub(focus).normalize().cross(UP).multiplyScalar(def.radius * 0.42);
    _desired.add(_v);
    focus.add(_v.multiplyScalar(0.42));
  }

  flight.camPos.lerp(_desired, 1 - Math.exp(-1.5 * dt));
  flight.camLook.lerp(focus, 1 - Math.exp(-2 * dt));
  flight.camRoll = dampAngle(flight.camRoll, 0, 1.6, dt);
  flight.camFov = damp(flight.camFov, panelOpen ? 38 : 44, 1.2, dt);
}

/* ------------------------------------------------------------------ */
/* FREE FLIGHT — the pilot has the controls                            */
/* ------------------------------------------------------------------ */

function updateFree(dt: number, t: number) {
  const g = useGame.getState();
  const maxSpeed = g.turbo ? TURBO_SPEED : CRUISE_SPEED;

  /* --- throttle ---------------------------------------------------- */
  let speedTarget: number;
  if (input.back > 0.05) {
    speedTarget = lerp(GLIDE_SPEED, REVERSE_SPEED, input.back);
  } else {
    speedTarget = lerp(GLIDE_SPEED, maxSpeed, input.forward);
  }
  const lambda = speedTarget < flight.speed ? BRAKE_LAMBDA : ACCEL_LAMBDA;
  flight.speed = damp(flight.speed, speedTarget, lambda, dt);
  flight.throttle = damp(
    flight.throttle,
    clamp(0.16 + input.forward * 0.84 - input.back * 0.16, 0, 1),
    2.6,
    dt
  );

  /* --- turning ----------------------------------------------------- */
  // Authority scales with airspeed: a nearly-stopped toy turns lazily.
  const authority = clamp(Math.abs(flight.speed) / (maxSpeed * 0.55), 0.35, 1);
  const yawTarget = input.turn * TURN_RATE * authority;
  // Damping the *rate* rather than the heading is what gives the turn its
  // build-up and its drift on release.
  flight.yawRate = damp(flight.yawRate, yawTarget, TURN_LAMBDA, dt);
  flight.heading -= flight.yawRate * dt;

  // Bank follows the achieved turn rate, not the key. Let go and the wings
  // level themselves as the turn decays.
  // Negative: a positive yaw rate is a right turn, and roll about +Z lifts
  // the +X wingtip — so banking *into* a right turn needs a negative roll.
  const bankTarget = clamp(-flight.yawRate * BANK_PER_YAW * 1.4, -BANK_MAX, BANK_MAX);
  flight.bank = damp(flight.bank, bankTarget, 2.6, dt);

  /* --- altitude ---------------------------------------------------- */
  const targetY = autoAltitude(flight.pos);
  const climbWanted = clamp((targetY - flight.pos.y) * 0.55, -7, 7);
  flight.vy = damp(flight.vy, climbWanted, 1.3, dt);
  flight.pos.y += flight.vy * dt;
  flight.pitch = damp(flight.pitch, clamp(flight.vy * 0.055, -0.3, 0.34), 2.6, dt);

  /* --- translation -------------------------------------------------- */
  headingVec(flight.heading, _v).multiplyScalar(flight.speed * dt);
  flight.pos.x += _v.x;
  flight.pos.z += _v.z;
  // A slow breathing bob, so the toy never looks rigid in the air.
  flight.pos.y += Math.sin(t * 1.1) * 0.006;

  applyOrientation();
  updateChaseCamera(dt, t, maxSpeed);

  /* --- landing zone ------------------------------------------------- */
  if (flight.landLock <= 0 && flight.approach && flight.approachDist < LAND_RADIUS) {
    const def = ISLAND_MAP[flight.approach];
    const dy = Math.abs(flight.pos.y - (def.position.y + 1));
    if (dy < 22) beginLanding(flight.approach);
  }

  /* --- idle nudge ---------------------------------------------------- */
  if (!g.jumpOffered && idleFor(IDLE_NUDGE_MS)) {
    useGame.getState().offerJump();
  }
}

/* ------------------------------------------------------------------ */
/* SCRIPTED MODES — takeoff, auto-pilot cruise, landing                */
/* ------------------------------------------------------------------ */

function updateScripted(dt: number, t: number, kind: "takeoff" | "landing") {
  const r = flight.route;
  if (!r) {
    flight.mode = "free";
    return;
  }


  r.elapsed += dt;

  // Anticipation: engine spools and the airframe shakes before it moves.
  if (r.elapsed < r.hold) {
    const s = r.elapsed / r.hold;
    flight.throttle = damp(flight.throttle, 0.55 + s * 0.45, 4, dt);
    flight.shake = Math.max(flight.shake, 0.12 + s * 0.35);
    flight.bob.step(-0.06 * s, dt);
    flight.pos.y += flight.bob.value * 0.05;
    applyOrientation();
    updateChaseCamera(dt, t, CRUISE_SPEED);
    return;
  }

  const u = clamp((r.elapsed - r.hold) / r.duration, 0, 1);
  // Landing bleeds off speed into the flare; takeoff and cruise both hold a
  // steady cruise between eased ends rather than peaking in the middle.
  const s = kind === "landing" ? easeOutCubic(u) : easeCruise(u);

  r.curve.getPointAt(clamp(s, 0, 1), _p);
  r.curve.getTangentAt(clamp(s, 0, 0.9999), _t).normalize();

  const prev = _v.copy(flight.pos);
  flight.pos.copy(_p);
  flight.speed = damp(flight.speed, prev.distanceTo(_p) / Math.max(dt, 1e-4), 5, dt);

  // Heading from the path tangent, and bank from how fast it is changing.
  const h = Math.atan2(-_t.x, -_t.z);
  let delta = h - flight.heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  flight.yawRate = damp(flight.yawRate, -delta / Math.max(dt, 1e-4), 3, dt);
  // Damped rather than assigned: entering a scripted mode from free flight
  // can otherwise snap the nose onto the path tangent in a single frame.
  flight.heading = dampAngle(flight.heading, h, 12, dt);
  flight.pitch = damp(flight.pitch, clamp(_t.y * 0.8, -0.4, 0.5), 3, dt);

  const bankTarget =
    kind === "landing" ? 0 : clamp(-flight.yawRate * BANK_PER_YAW, -BANK_MAX, BANK_MAX);
  flight.bank = damp(flight.bank, bankTarget, 3, dt);

  // Throttle: full on climb-out, easing off through the flare.
  const flare = kind === "landing" ? 1 - u * 0.75 : 1 - clamp((u - 0.9) / 0.1, 0, 1) * 0.5;
  flight.throttle = damp(flight.throttle, 0.45 + 0.55 * flare, 3, dt);

  // Level the wings and line up with the pad over the last stretch.
  if (kind !== "takeoff" && u > 0.82) {
    const f = easeOutCubic((u - 0.82) / 0.18);
    const target = r.to ? ISLAND_MAP[r.to].padHeading : flight.heading;
    flight.heading = dampAngle(flight.heading, target, 3 + f * 8, dt);
    flight.bank = damp(flight.bank, 0, 6, dt);
    flight.pitch = damp(flight.pitch, 0.04, 4, dt);
  }

  applyOrientation();
  updateChaseCamera(dt, t, CRUISE_SPEED, kind === "landing" ? u : 0);

  if (u >= 1) {
    if (kind === "landing" && r.to) {
      flight.bob.velocity = -7.5;
      flight.shake = 0.55;
      flight.justLanded = 0.9;
      const to = r.to;
      parkAt(to);
      useGame.getState().arrive(to);
    } else if (kind === "takeoff") {
      flight.mode = "free";
      flight.route = null;
      flight.yawRate = 0;
    } else if (r.to) {
      // Auto-pilot delivered us to the pad; hand off to the landing flare.
      beginLanding(r.to);
    }
  }
}

/* ------------------------------------------------------------------ */
/* CHASE CAMERA                                                        */
/* ------------------------------------------------------------------ */

function updateChaseCamera(dt: number, t: number, maxSpeed: number, landing = 0) {
  const turbo = useGame.getState().turbo;
  const speedFrac = clamp(Math.abs(flight.speed) / maxSpeed, 0, 1);

  // On short final, drift out to the side and drop low so the touchdown is
  // seen in profile rather than from directly behind the tail.
  const ease = easeInOutCubic(landing);

  // Offset is rotated by heading only — never by bank — so the horizon does
  // not roll with the aeroplane. Bank is expressed as camera *tilt* below.
  _desired.set(ease * 7.5, 3.6 + ease * 0.8 + speedFrac * 0.6, 12 + speedFrac * 2.2 - ease * 2.6);
  _desired.applyQuaternion(_q.setFromAxisAngle(UP, flight.heading));
  _desired.add(flight.pos);
  _desired.x += wobble(t * 0.17, 4) * 0.5;
  // Never dive below the aeroplane on a steep descent.
  _desired.y = Math.max(_desired.y, flight.pos.y + 1.4);

  // Position lags more than aim: that difference is the whole reason the
  // camera appears to swing wide through a turn and catch up on the exit.
  flight.camPos.lerp(_desired, 1 - Math.exp(-(turbo ? 3.2 : 2.4) * dt));

  _lookTarget
    .set(0, 0.6, -8 - ease * 3 - speedFrac * 3)
    .applyQuaternion(_q.setFromAxisAngle(UP, flight.heading))
    .add(flight.pos);
  flight.camLook.lerp(_lookTarget, 1 - Math.exp(-3.4 * dt));

  flight.camRoll = dampAngle(flight.camRoll, flight.bank * 0.3, 2.2, dt);
  // A little fov stretch with speed — cheap, effective sense of pace.
  flight.camFov = damp(flight.camFov, 46 + speedFrac * (turbo ? 20 : 9) - ease * 4, 1.8, dt);
}


/* ------------------------------------------------------------------ */
/* WARP — travel as a decision, not a journey                          */
/* ------------------------------------------------------------------ */

const WARP_DURATION = 1.55;
/** The instant the aeroplane is gone and the world is relocated. */
const WARP_BLINK = 0.44;

/**
 * The jump.
 *
 * Two halves either side of a single hidden frame. On the way in the camera
 * rushes the aeroplane while it spins up and folds to nothing; on that one
 * frame everything is teleported; on the way out it unfolds on the far pad
 * and the camera eases back to its usual parked orbit. The screen flash
 * peaks exactly on the cut, which is what makes the relocation invisible.
 */
function updateWarp(dt: number, t: number) {
  const to = flight.warpTo;
  if (!to) {
    flight.mode = "free";
    return;
  }
  const def = ISLAND_MAP[to];
  const pad = padWorld(def);

  const prev = flight.warpT;
  flight.warpT = Math.min(1, flight.warpT + dt / WARP_DURATION);
  const u = flight.warpT;

  // Flash rises into the cut and falls out of it, squared so the peak is tight.
  const f = 1 - Math.min(1, Math.abs(u - WARP_BLINK) / 0.36);
  flight.warpFlash = f * f;

  if (u < WARP_BLINK) {
    /* --- fold away ------------------------------------------------- */
    const k = u / WARP_BLINK;
    const e = easeInOutCubic(k);
    flight.warpSpin += dt * (5 + k * 40);
    // Squared so it hangs at full size then vanishes quickly at the end.
    flight.visualScale = Math.max(0, 1 - e * e);
    flight.throttle = damp(flight.throttle, 1, 5, dt);

    // Keep drifting so it never looks frozen while it collapses.
    headingVec(flight.heading, _v).multiplyScalar(flight.speed * dt * (1 - k));
    flight.pos.x += _v.x;
    flight.pos.z += _v.z;
    flight.speed = damp(flight.speed, 0, 2.2, dt);

    _desired
      .set(0, 2.4 - e * 0.8, 8 - e * 5)
      .applyQuaternion(_q.setFromAxisAngle(UP, flight.heading))
      .add(flight.pos);
    flight.camPos.lerp(_desired, 1 - Math.exp(-9 * dt));
    flight.camLook.lerp(flight.pos, 1 - Math.exp(-10 * dt));
    flight.camFov = damp(flight.camFov, 82, 6, dt);
    flight.camRoll = damp(flight.camRoll, -0.5 * e, 8, dt);
  } else {
    /* --- unfold ---------------------------------------------------- */
    if (prev < WARP_BLINK) {
      // The one frame where everything moves. Hidden entirely by the flash.
      flight.pos.copy(pad).add(_t.set(0, 0.62, 0));
      flight.heading = def.padHeading;
      flight.speed = 0;
      flight.yawRate = 0;
      flight.bank = 0;
      flight.pitch = 0;
      flight.vy = 0;
      flight.orbit = def.padHeading + Math.PI * 0.7;
      flight.camPos.set(
        def.position.x + Math.cos(flight.orbit) * def.orbitRadius * 0.5,
        def.position.y + def.orbitHeight * 0.7,
        def.position.z + Math.sin(flight.orbit) * def.orbitRadius * 0.5
      );
      flight.camLook.copy(def.position).add(_t.set(0, 3.4, 0));
      flight.camRoll = 0.4;
      flight.camFov = 76;
      flight.shake = 0.4;
    }

    const k = (u - WARP_BLINK) / (1 - WARP_BLINK);
    const e = easeOutCubic(k);
    flight.warpSpin *= Math.max(0, 1 - dt * 7);
    // Overshoots 1 slightly then settles — the toy pops back into being.
    flight.visualScale = Math.min(1, e * 1.15);
    flight.throttle = damp(flight.throttle, 0.14, 3, dt);
    flight.pos.lerp(
      _p.copy(pad).add(_t.set(0, 0.62 + islandBob(def, t), 0)),
      1 - Math.exp(-8 * dt)
    );
    flight.heading = dampAngle(flight.heading, def.padHeading, 6, dt);

    flight.orbit += dt * 0.45 * (1 - e);
    const focus = _lookTarget.copy(def.position).add(_p.set(0, 3.4, 0));
    _desired.set(
      def.position.x + Math.cos(flight.orbit) * def.orbitRadius,
      def.position.y + def.orbitHeight,
      def.position.z + Math.sin(flight.orbit) * def.orbitRadius
    );
    flight.camPos.lerp(_desired, 1 - Math.exp(-3.5 * dt));
    flight.camLook.lerp(focus, 1 - Math.exp(-4 * dt));
    flight.camRoll = dampAngle(flight.camRoll, 0, 5, dt);
    flight.camFov = damp(flight.camFov, 44, 3.5, dt);
  }

  applyOrientation();

  if (u >= 1) {
    flight.visualScale = 1;
    flight.warpSpin = 0;
    flight.warpFlash = 0;
    flight.warpTo = null;
    parkAt(to);
    useGame.getState().arrive(to);
  }
}

/* ------------------------------------------------------------------ */
/* FINALE                                                              */
/* ------------------------------------------------------------------ */

function updateFinale(dt: number, t: number) {
  const def = ISLAND_MAP.contact;
  const pad = padWorld(def);
  flight.bob.step(0, dt);
  flight.pos.lerp(_p.copy(pad).add(_t.set(0, 0.6 + islandBob(def, t), 0)), 1 - Math.exp(-4 * dt));
  flight.heading = dampAngle(flight.heading, def.padHeading + 0.5, 2.5, dt);
  // The propeller winds down and stops.
  flight.throttle = damp(flight.throttle, 0, 0.7, dt);
  flight.bank = damp(flight.bank, 0, 2, dt);
  flight.pitch = damp(flight.pitch, 0, 2, dt);
  applyOrientation();

  flight.orbit += dt * 0.045;
  const focus = _lookTarget.copy(def.position).add(_p.set(0, 7, 0));
  _desired.set(
    def.position.x + Math.cos(flight.orbit) * 28,
    def.position.y + 10.5,
    def.position.z + Math.sin(flight.orbit) * 28
  );
  flight.camPos.lerp(_desired, 1 - Math.exp(-1.1 * dt));
  flight.camLook.lerp(focus, 1 - Math.exp(-1.6 * dt));
  flight.camFov = damp(flight.camFov, 52, 1, dt);
  flight.camRoll = dampAngle(flight.camRoll, 0, 1.4, dt);
}

/* ------------------------------------------------------------------ */

/** Full reset — used on first mount and by Replay Journey. */
export function resetFlight() {
  const home = ISLAND_MAP.home;
  const pad = padWorld(home);
  flight.mode = "parked";
  flight.parkedAt = "home";
  flight.pos.copy(pad).add(new THREE.Vector3(0, 0.62, 0));
  flight.heading = home.padHeading;
  flight.yawRate = 0;
  flight.bank = 0;
  flight.pitch = 0;
  flight.speed = 0;
  flight.throttle = 0;
  flight.vy = 0;
  flight.route = null;
  flight.shake = 0;
  flight.justLanded = 0;
  flight.landLock = 0;
  flight.warpT = 0;
  flight.warpTo = null;
  flight.warpSpin = 0;
  flight.warpFlash = 0;
  flight.visualScale = 1;
  applyOrientation();

  // Open on a wide, slightly low three-quarter view of the airport.
  flight.orbit = Math.PI * 0.72;
  flight.camPos.set(
    home.position.x + Math.cos(flight.orbit) * home.orbitRadius,
    home.position.y + home.orbitHeight,
    home.position.z + Math.sin(flight.orbit) * home.orbitRadius
  );
  flight.camLook.copy(home.position).add(new THREE.Vector3(0, 3.4, 0));
  flight.camFov = 44;
  flight.camRoll = 0;
  lastTick = -1;
}

/** Compass bearing in degrees, 0 = north. */
export const bearingDeg = () => ((flight.heading * 180) / Math.PI + 360) % 360;

export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export const bearingLabel = () => COMPASS[Math.round(bearingDeg() / 45) % 8];
