"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/store";
import { profile } from "@/data/resume";
import { startAudio, sfx } from "@/lib/audio";

/**
 * The opening.
 *
 * No prologue, no cutscene: the airport is already alive behind this — the
 * propeller is turning, the windsock is moving, the birds are circling — and
 * the only thing between the visitor and flying is one button.
 *
 * That button is also the audio unlock, since it is the first real user
 * gesture we are given.
 */

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 26, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { delay, duration: 0.95, ease: [0.16, 1, 0.3, 1] as const },
});

export function StartScreen() {
  const phase = useGame((s) => s.phase);
  const launch = useGame((s) => s.launch);
  const isTouch = useGame((s) => s.isTouch);
  const say = useGame((s) => s.say);
  const [armed, setArmed] = useState(false);

  const show = phase === "ready";

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setArmed(true), 1500);
    return () => clearTimeout(t);
  }, [show]);

  const go = async () => {
    await startAudio();
    sfx("click");
    launch();
    setTimeout(
      () =>
        say(
          isTouch
            ? "Steer with the stick, hold the throttle to climb. Fly over a glowing pad to land."
            : "↑ throttle · ↓ brake · ← → turn. Fly over a glowing landing pad to touch down.",
          "info"
        ),
      4200
    );
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="start"
          exit={{ opacity: 0, y: -24, filter: "blur(8px)" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="start__inner">
            <motion.p className="start__kicker" {...rise(0.25)}>
              Welcome, Captain
            </motion.p>

            <motion.h1 className="start__title" {...rise(0.45)}>
              Fly through{" "}
              <span className="start__name">{profile.fullName}</span>&rsquo;s
              engineering journey
            </motion.h1>

            <motion.p className="start__sub" {...rise(0.7)}>
              {profile.title} · {profile.location} · 2+ years across enterprise and
              defence-grade systems. Seven islands. You are the pilot.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.92 }}
              animate={armed ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 28, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 210, damping: 16 }}
            >
              <button type="button" className="toy-btn toy-btn--lg" onClick={go}>
                <span aria-hidden="true">✈</span> START JOURNEY
              </button>
            </motion.div>

            <motion.div
              className="start__controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: armed ? 1 : 0 }}
              transition={{ delay: 0.35, duration: 0.7 }}
            >
              {isTouch ? (
                <span>Stick to steer · Throttle to climb</span>
              ) : (
                <>
                  <span className="kbd-row">
                    <kbd>↑</kbd>
                    <kbd>↓</kbd>
                    <kbd>←</kbd>
                    <kbd>→</kbd>
                    <em>or</em>
                    <kbd>W</kbd>
                    <kbd>A</kbd>
                    <kbd>S</kbd>
                    <kbd>D</kbd>
                  </span>
                  <span className="start__hint">Sound on · headphones recommended</span>
                </>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
