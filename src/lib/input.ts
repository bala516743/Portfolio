"use client";

/**
 * Pilot input.
 *
 * A plain mutable object, read once per frame by the flight model. Keyboard
 * and the on-screen joystick both write into it, so the flight code never
 * needs to know which one is driving.
 *
 * `lastActive` drives the idle nudge: if nothing has been touched for a
 * while, the HUD offers to jump you to your objective instead.
 */

export const input = {
  /** 0..1 — throttle up. */
  forward: 0,
  /** 0..1 — brake / reverse. */
  back: 0,
  /** -1 (left) .. 1 (right). */
  turn: 0,
  /** performance.now() of the last real pilot action. */
  lastActive: 0,
  enabled: true,
};

const KEYS = {
  forward: ["ArrowUp", "KeyW"],
  back: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
} as const;

const pressed = new Set<string>();
// The stick and the throttle button are tracked separately and combined, so
// steering with one thumb never cancels the throttle held by the other.
let stickTurn = 0;
let stickThrottle = 0;
let buttonThrottle = 0;

const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
};

function markActive() {
  input.lastActive = performance.now();
}

function onKeyDown(e: KeyboardEvent) {
  if (!input.enabled || isTypingTarget(e.target)) return;
  const code = e.code;
  const known =
    KEYS.forward.includes(code as never) ||
    KEYS.back.includes(code as never) ||
    KEYS.left.includes(code as never) ||
    KEYS.right.includes(code as never);
  if (!known) return;
  // Arrow keys scroll the page by default; there is nothing to scroll here.
  e.preventDefault();
  if (!pressed.has(code)) markActive();
  pressed.add(code);
}

function onKeyUp(e: KeyboardEvent) {
  pressed.delete(e.code);
}

/** On-screen joystick. `x` -1..1 steers; `y` -1..1 (up is +1) also throttles. */
export function setTouchAxis(x: number, y: number) {
  stickTurn = x;
  stickThrottle = y;
  if (Math.abs(x) > 0.08 || Math.abs(y) > 0.08) markActive();
}

/** On-screen throttle button, 0..1. */
export function setTouchThrottle(v: number) {
  buttonThrottle = v;
  if (v > 0.05) markActive();
}

export function resetTouch() {
  stickTurn = 0;
  stickThrottle = 0;
  buttonThrottle = 0;
}

/** Resolve held keys + touch axes into the input object. Once per frame. */
export function sampleInput() {
  const kf = KEYS.forward.some((k) => pressed.has(k)) ? 1 : 0;
  const kb = KEYS.back.some((k) => pressed.has(k)) ? 1 : 0;
  const kl = KEYS.left.some((k) => pressed.has(k)) ? 1 : 0;
  const kr = KEYS.right.some((k) => pressed.has(k)) ? 1 : 0;

  const throttle = Math.max(stickThrottle, buttonThrottle);
  input.forward = Math.min(1, kf + Math.max(0, throttle));
  input.back = Math.min(1, kb + Math.max(0, -Math.min(stickThrottle, 0)));
  input.turn = Math.max(-1, Math.min(1, kr - kl + stickTurn));

  // Holding a key counts as being active, not just pressing it.
  if (kf || kb || kl || kr || Math.abs(stickTurn) > 0.08 || Math.abs(throttle) > 0.08) {
    input.lastActive = performance.now();
  }
}

/** True if the pilot has done nothing for `ms`. */
export const idleFor = (ms: number) => performance.now() - input.lastActive > ms;


export function clearInput() {
  pressed.clear();
  resetTouch();
  input.forward = input.back = input.turn = 0;
}

export function attachInput() {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  // Losing focus mid-turn would otherwise leave the plane banking forever.
  window.addEventListener("blur", clearInput);
  input.lastActive = performance.now();
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearInput);
    clearInput();
  };
}
