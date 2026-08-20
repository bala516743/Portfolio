"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useGame } from "@/lib/store";
import { education, experiences, profile, projects, skills } from "@/data/resume";
import { resetFlight } from "@/lib/flight";
import { sfx } from "@/lib/audio";
import { STAR_TOTAL } from "@/three/world/Collectibles";

/**
 * The finale.
 *
 * The notebook from the desk opens, the résumé slides out of it, and the
 * stamp comes down. Everything below the stamp is a real link — this is the
 * one screen where the experience gets out of the way and hands over the
 * contact details.
 */

const spring = { type: "spring", stiffness: 220, damping: 24 } as const;

export function MissionComplete() {
  const phase = useGame((s) => s.phase);
  const replay = useGame((s) => s.replay);
  const stars = useGame((s) => s.starsFound.length);
  const muted = useGame((s) => s.muted);
  const devMode = useGame((s) => s.devMode);

  const show = phase === "complete";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="finale"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          role="dialog"
          aria-label="Mission complete"
        >
          <motion.div
            className="notebook"
            // The notebook opens: it rotates up off its spine.
            initial={{ opacity: 0, rotateX: -70, y: 70, scale: 0.9 }}
            animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
            transition={{ ...spring, delay: 0.25, mass: 1.1 }}
            style={{ transformPerspective: 1400, transformOrigin: "bottom center" }}
          >
            <motion.div
              className="notebook__stamp"
              initial={{ opacity: 0, scale: 0.4, rotate: 24 }}
              animate={{ opacity: 1, scale: 1, rotate: -7 }}
              transition={{ type: "spring", stiffness: 300, damping: 12, delay: 1.15 }}
              onAnimationComplete={() => {
                if (!muted) sfx("stamp");
              }}
            >
              <span className="stamp">MISSION COMPLETE</span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.55 }}
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.9rem, 5vw, 2.9rem)",
                fontWeight: 600,
                lineHeight: 1.02,
              }}
            >
              {profile.fullName}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.68 }}
              style={{ margin: "0.3rem 0 1.2rem", color: "var(--ink-soft)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.76rem" }}
            >
              {profile.title} · {profile.location}
            </motion.p>

            {/* The résumé sliding out of the notebook. */}
            <motion.div
              className="card"
              initial={{ opacity: 0, y: -34, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...spring, delay: 0.85 }}
            >
              <p style={{ lineHeight: 1.6 }}>{profile.summary}</p>
            </motion.div>

            <motion.div
              className="stat-row"
              style={{ marginTop: "0.9rem" }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 1 }}
            >
              {[
                { v: "2+", l: "Years" },
                { v: String(projects.length), l: "Projects" },
                { v: String(experiences.length), l: "Employers" },
                { v: String(skills.length), l: "Technologies" },
                { v: `${stars}/${STAR_TOTAL}`, l: "Stars found" },
              ].map((s) => (
                <div className="stat" key={s.l}>
                  <div className="stat__value">{s.v}</div>
                  <div className="stat__label">{s.l}</div>
                </div>
              ))}
            </motion.div>

            <motion.p
              className="hand"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3, duration: 0.7 }}
              style={{ marginTop: "1rem" }}
            >
              {education.degree} · {education.institution} · {education.period} · CGPA{" "}
              {education.cgpa}
            </motion.p>

            <motion.div
              className="link-grid"
              style={{ marginTop: "1.4rem" }}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 1.4 }}
            >
              <a className="toy-btn toy-btn--tomato" href={profile.resumeFile} download>
                ↓ Download résumé
              </a>
              <a
                className="toy-btn toy-btn--ghost"
                href={profile.linkedin}
                target="_blank"
                rel="noreferrer noopener"
              >
                in LinkedIn
              </a>
              <a
                className="toy-btn toy-btn--ghost"
                href={profile.github}
                target="_blank"
                rel="noreferrer noopener"
              >
                ⌥ GitHub
              </a>
              <a className="toy-btn toy-btn--mint" href={`mailto:${profile.email}`}>
                ✉ Email
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.7, duration: 0.6 }}
              style={{ marginTop: "1.2rem", display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}
            >
              <button
                type="button"
                className="toy-btn"
                onClick={() => {
                  resetFlight();
                  replay();
                  if (!muted) sfx("power");
                }}
              >
                ↻ Replay journey
              </button>
              <span style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                {stars === STAR_TOTAL
                  ? "Every star collected. Nothing left up there."
                  : `${STAR_TOTAL - stars} star${STAR_TOTAL - stars === 1 ? "" : "s"} still hidden along the routes.`}
                {devMode && " · Developer mode active."}
              </span>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
