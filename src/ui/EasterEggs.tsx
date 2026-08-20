"use client";

import { useEffect, useRef } from "react";
import { useGame } from "@/lib/store";
import { sfx } from "@/lib/audio";
import { MISSION_ISLANDS } from "@/data/world";

/**
 * Hidden things, and environment detection.
 *
 * Konami unlocks developer mode; the rest of the eggs live where they
 * belong (the sun in Sky.tsx, the clouds in Weather.tsx, the stars in
 * Collectibles.tsx, turbo on the aeroplane itself). This component owns the
 * keyboard, plus the two capability checks that change how the world is
 * built: reduced motion and touch.
 */

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

export function EasterEggs() {
  const enableDevMode = useGame((s) => s.enableDevMode);
  const devMode = useGame((s) => s.devMode);
  const setRainbow = useGame((s) => s.setRainbow);
  const setReducedMotion = useGame((s) => s.setReducedMotion);
  const setIsTouch = useGame((s) => s.setIsTouch);
  const setLowPower = useGame((s) => s.setLowPower);
  const say = useGame((s) => s.say);
  const warpTo = useGame((s) => s.warpTo);
  const toggleTime = useGame((s) => s.toggleTime);
  const muted = useGame((s) => s.muted);
  const visited = useGame((s) => s.visited);
  const raining = useGame((s) => s.raining);
  const phase = useGame((s) => s.phase);

  const buf = useRef<string[]>([]);

  /* --- capability detection ---------------------------------------- */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);

    // Both signals, not either: a desktop browser reporting a coarse pointer
    // (headless, some trackpads, dev emulation) would otherwise get the
    // touch copy and the tap hint.
    setIsTouch(
      window.matchMedia("(pointer: coarse)").matches && (navigator.maxTouchPoints ?? 0) > 0
    );

    // A conservative starting point on devices that are very unlikely to
    // hold 60fps at full detail. PerformanceMonitor refines this at runtime.
    const cores = navigator.hardwareConcurrency ?? 8;
    const small = window.innerWidth < 820;
    if (cores <= 4 || (small && cores <= 6)) setLowPower(true);

    return () => mq.removeEventListener("change", apply);
  }, [setReducedMotion, setIsTouch, setLowPower]);

  /* --- rainbow after rain ------------------------------------------ */
  useEffect(() => {
    if (!raining) return;
    // Rain, then sun, then a rainbow — the sequence, not just the state.
    const t = setTimeout(() => {
      setRainbow(true);
      say("Rainbow spotted off the port wing.", "reward");
      if (!muted) sfx("chime");
    }, 9000);
    return () => clearTimeout(t);
  }, [raining, setRainbow, say, muted]);

  /* --- keyboard ----------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      // Konami
      buf.current = [...buf.current, e.key].slice(-KONAMI.length);
      if (!devMode && buf.current.join(",").toLowerCase() === KONAMI.join(",").toLowerCase()) {
        enableDevMode();
        setRainbow(true);
        if (!muted) sfx("star");
        say(
          "DEVELOPER MODE — number keys 1-7 jump between islands. N toggles night.",
          "system"
        );
      }

      if (!devMode) return;
      if (phase !== "landed" && phase !== "flying") return;

      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= MISSION_ISLANDS.length + 1) {
        const ids = ["home", ...MISSION_ISLANDS] as const;
        warpTo(ids[n - 1]);
        if (!muted) sfx("click");
      }
      if (e.key.toLowerCase() === "n") toggleTime();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    devMode,
    enableDevMode,
    setRainbow,
    say,
    muted,
    warpTo,
    toggleTime,
    phase,
  ]);

  /* --- completion nudge --------------------------------------------- */
  const nudged = useRef(false);
  useEffect(() => {
    if (nudged.current) return;
    if (MISSION_ISLANDS.every((m) => visited.includes(m))) {
      nudged.current = true;
    }
  }, [visited]);

  return null;
}
