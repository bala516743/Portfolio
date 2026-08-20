"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store";

/**
 * The loading screen builds the aeroplane instead of spinning a circle.
 *
 * Six stages, each with its own caption. The bar is honest — it tracks a
 * real minimum-duration timer rather than pretending to measure bytes —
 * but it never sits at 90% waiting, and it never finishes before the
 * assembly does, because the assembly *is* the loading experience.
 */

const STAGES = [
  { at: 0.0, caption: "Unpacking the crate…" },
  { at: 0.16, caption: "Fitting the wheels…" },
  { at: 0.34, caption: "Attaching the wings…" },
  { at: 0.52, caption: "Installing the propeller…" },
  { at: 0.7, caption: "Filling the tank…" },
  { at: 0.86, caption: "Starting the engine…" },
];

const spring = { type: "spring", stiffness: 220, damping: 16, mass: 0.9 } as const;

export function Loader() {
  const phase = useGame((s) => s.phase);
  const ready = useGame((s) => s.ready);
  const setBootProgress = useGame((s) => s.setBootProgress);
  const [p, setP] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (phase !== "boot") return;
    const start = performance.now();
    // 4.2 seconds. Long enough to enjoy, short enough not to resent.
    const DURATION = 4200;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      // Ease so the last stages linger slightly — that is where the payoff is.
      const eased = 1 - Math.pow(1 - t, 2.1);
      setP(eased);
      setBootProgress(eased);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setDone(true);
        setTimeout(ready, 720);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, ready, setBootProgress]);

  const stage = STAGES.reduce((acc, s, i) => (p >= s.at ? i : acc), 0);
  const show = phase === "boot";

  const part = (from: number) => ({
    initial: { opacity: 0, scale: 0.4, y: -18 },
    animate: p >= from ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.4, y: -18 },
    transition: spring,
  });

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="loader"
          role="status"
          aria-live="polite"
          aria-label="Assembling the aeroplane"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="loader__inner">
            <div className="loader__stage">
              <svg viewBox="0 0 260 150" width="260" height="150" aria-hidden="true">
                {/* workbench line */}
                <motion.line
                  x1="20" y1="126" x2="240" y2="126"
                  stroke="rgba(255,248,236,0.18)" strokeWidth="3" strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />

                {/* wheels — stage 1 */}
                <motion.g {...part(0.16)}>
                  <circle cx="104" cy="112" r="12" fill="#3C3A44" />
                  <circle cx="104" cy="112" r="5" fill="#FFC65C" />
                  <circle cx="150" cy="112" r="12" fill="#3C3A44" />
                  <circle cx="150" cy="112" r="5" fill="#FFC65C" />
                </motion.g>

                {/* fuselage — always, it is the crate contents */}
                <motion.g {...part(0.02)}>
                  <rect x="72" y="66" width="118" height="34" rx="17" fill="#E8553F" />
                  <rect x="86" y="86" width="94" height="14" rx="7" fill="#FDF3E3" />
                  <path d="M190 68 q22 15 0 30 z" fill="#C33C2C" />
                  <circle cx="120" cy="70" r="13" fill="#CFEFFF" opacity="0.9" />
                  <rect x="98" y="78" width="70" height="6" rx="3" fill="#FFC65C" />
                </motion.g>

                {/* wings — stage 2 */}
                <motion.g {...part(0.34)}>
                  <rect x="88" y="58" width="86" height="11" rx="5.5" fill="#FDF3E3" />
                  <rect x="88" y="58" width="16" height="11" rx="5.5" fill="#E8553F" />
                  <rect x="158" y="58" width="16" height="11" rx="5.5" fill="#E8553F" />
                  <rect x="176" y="44" width="10" height="26" rx="5" fill="#E8553F" />
                  <rect x="176" y="44" width="10" height="9" rx="4" fill="#FFC65C" />
                </motion.g>

                {/* propeller — stage 3 */}
                <motion.g
                  {...part(0.52)}
                  style={{ originX: "70px", originY: "83px" }}
                >
                  <motion.g
                    animate={p >= 0.86 ? { rotate: 360 } : { rotate: 0 }}
                    transition={
                      p >= 0.86
                        ? { repeat: Infinity, duration: 0.22, ease: "linear" }
                        : spring
                    }
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  >
                    <rect x="64" y="56" width="9" height="54" rx="4.5" fill="#DEA867" />
                    <rect x="66.5" y="60" width="4" height="46" rx="2" fill="#8A5F35" />
                  </motion.g>
                  <circle cx="68.5" cy="83" r="7" fill="#8A5F35" />
                </motion.g>

                {/* fuel — stage 4 */}
                <motion.g {...part(0.7)}>
                  <rect x="196" y="88" width="24" height="30" rx="5" fill="#4C9BD6" />
                  <rect x="203" y="80" width="10" height="10" rx="3" fill="#357099" />
                  <motion.path
                    d="M196 96 q-20 -6 -28 -14"
                    stroke="#7FE3B0" strokeWidth="4" strokeLinecap="round" fill="none"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: p >= 0.7 ? 1 : 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </motion.g>

                {/* exhaust — stage 5 */}
                <AnimatePresence>
                  {p >= 0.86 &&
                    [0, 1, 2].map((i) => (
                      <motion.circle
                        key={i}
                        cx={62} cy={100} r={5 + i * 2}
                        fill="rgba(255,248,236,0.35)"
                        initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                        animate={{ opacity: [0, 0.6, 0], x: -26 - i * 12, y: -10 - i * 6, scale: 1.6 }}
                        transition={{ repeat: Infinity, duration: 1.3, delay: i * 0.28 }}
                      />
                    ))}
                </AnimatePresence>
              </svg>
            </div>

            <div className="loader__caption">
              <AnimatePresence mode="wait">
                <motion.span
                  key={stage}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  {done ? "Ready for departure." : STAGES[stage].caption}
                </motion.span>
              </AnimatePresence>
            </div>

            <div className="loader__bar">
              <motion.div
                className="loader__fill"
                style={{ width: `${p * 100}%` }}
                transition={{ duration: 0 }}
              />
            </div>

            <p className="loader__hint">Built in a workshop, not a warehouse</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
