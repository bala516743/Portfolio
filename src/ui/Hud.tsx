"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useGame, selectProgress, selectAllVisited } from "@/lib/store";
import { ISLANDS, ISLAND_MAP, MISSION_ISLANDS, type IslandId } from "@/data/world";
import { profile } from "@/data/resume";
import { flight, bearingLabel, bearingDeg } from "@/lib/flight";
import { sfx, setMuted, setRainAudio } from "@/lib/audio";
import { STAR_TOTAL } from "@/three/world/Collectibles";

/**
 * Head-up display.
 *
 * Two jobs: fly the aeroplane, and know where you are going. The instrument
 * strip is read straight out of the flight system every animation frame
 * *without* touching React state — a 60Hz store write would re-render the
 * whole tree sixty times a second for the sake of a speed readout.
 */

/* ------------------------------------------------------------------ */
/* Live instruments — imperative DOM writes, no re-renders             */
/* ------------------------------------------------------------------ */

function Instruments() {
  const phase = useGame((s) => s.phase);
  const destination = useGame((s) => s.destination);
  const speedRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const hdgRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const needle = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (phase !== "flying") return;
    const tick = () => {
      if (speedRef.current) speedRef.current.textContent = Math.round(Math.abs(flight.speed) * 3.6).toString();
      if (altRef.current) altRef.current.textContent = Math.max(0, Math.round(flight.pos.y + 60)).toString();
      if (hdgRef.current) hdgRef.current.textContent = bearingLabel();
      if (distRef.current) {
        distRef.current.textContent = Number.isFinite(flight.targetDist)
          ? `${Math.round(flight.targetDist * 10)}m`
          : "—";
      }
      if (needle.current) {
        // Compass needle points at the objective, relative to the nose.
        if (destination) {
          const d = ISLAND_MAP[destination].position;
          const bearing = Math.atan2(-(d.x - flight.pos.x), -(d.z - flight.pos.z));
          let rel = bearing - flight.heading;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          needle.current.style.transform = `rotate(${-rel}rad)`;
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, destination]);

  const target = destination ? ISLAND_MAP[destination] : null;

  return (
    <motion.div
      className="instruments"
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="instr instr--mission">
        <span className="instr__label">Current mission</span>
        <span className="instr__mission">
          {target ? (
            <>
              <span className="instr__needle" ref={needle} aria-hidden="true">
                ➤
              </span>
              <span aria-hidden="true">{target.glyph}</span> Fly to {target.label}
            </>
          ) : (
            "Free flight"
          )}
        </span>
      </div>
      <div className="instr">
        <span className="instr__label">Distance</span>
        <span className="instr__value" ref={distRef}>
          —
        </span>
      </div>
      <div className="instr">
        <span className="instr__label">Heading</span>
        <span className="instr__value" ref={hdgRef}>
          N
        </span>
      </div>
      <div className="instr">
        <span className="instr__label">Speed</span>
        <span className="instr__value">
          <span ref={speedRef}>0</span>
          <em>km/h</em>
        </span>
      </div>
      <div className="instr">
        <span className="instr__label">Altitude</span>
        <span className="instr__value">
          <span ref={altRef}>0</span>
          <em>m</em>
        </span>
      </div>
      <div className="instr">
        <span className="instr__label">Fuel</span>
        <span className="instr__value">∞</span>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Approach banner                                                     */
/* ------------------------------------------------------------------ */

function ApproachBanner() {
  const phase = useGame((s) => s.phase);
  const [near, setNear] = useState<IslandId | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (phase !== "flying") {
      setNear(null);
      return;
    }
    const tick = () => {
      // Only announce once you are genuinely close, and only re-render on
      // the transition, not every frame.
      const id = flight.approach && flight.approachDist < 42 ? flight.approach : null;
      setNear((prev) => (prev === id ? prev : id));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase]);

  const def = near ? ISLAND_MAP[near] : null;

  return (
    <AnimatePresence>
      {def && (
        <motion.div
          className="approach"
          initial={{ opacity: 0, y: 16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="approach__label">Approaching</span>
          <span className="approach__name">
            {def.glyph} {def.label}
          </span>
          <span className="approach__hint">Fly over the glowing pad to land</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Checkpoint celebration                                              */
/* ------------------------------------------------------------------ */

function Checkpoint() {
  const celebrating = useGame((s) => s.celebrating);
  const visited = useGame((s) => s.visited);
  const destination = useGame((s) => s.destination);
  // A warp opens the panel on arrival, so the celebration and the panel now
  // appear together. Shift the card into whatever space the panel leaves.
  const panelOpen = useGame((s) => s.panelOpen);
  const def = celebrating ? ISLAND_MAP[celebrating] : null;
  const next = destination ? ISLAND_MAP[destination] : null;
  const done = visited.filter((v) => MISSION_ISLANDS.includes(v)).length;

  return (
    <AnimatePresence>
      {def && (
        <motion.div
          className="checkpoint"
          data-shift={panelOpen}
          initial={{ opacity: 0, scale: 0.86, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -18 }}
          transition={{ type: "spring", stiffness: 210, damping: 20 }}
          role="status"
        >
          <span className="checkpoint__badge">Mission complete</span>
          <span className="checkpoint__name">
            <span aria-hidden="true">✓</span> {def.label}
          </span>
          <span className="checkpoint__count">
            {done} of {MISSION_ISLANDS.length} islands logged
          </span>
          {next && next.id !== def.id && (
            <span className="checkpoint__next">
              Next destination · {next.glyph} {next.label}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Idle nudge — offers to jump rather than to fly for you              */
/* ------------------------------------------------------------------ */

function JumpPrompt() {
  const offered = useGame((s) => s.jumpOffered);
  const warping = useGame((s) => s.warping);
  const destination = useGame((s) => s.destination);
  const warpTo = useGame((s) => s.warpTo);
  const dismiss = useGame((s) => s.dismissJump);
  const muted = useGame((s) => s.muted);
  const def = destination ? ISLAND_MAP[destination] : null;

  return (
    <AnimatePresence>
      {offered && !warping && def && (
        <motion.div
          className="jump"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
        >
          <p className="jump__text">
            Rather skip the flight? Jump straight to {def.label}.
          </p>
          <div className="jump__row">
            <button
              type="button"
              className="toy-btn toy-btn--mint"
              onClick={() => {
                warpTo(def.id);
                if (!muted) sfx("chime");
              }}
            >
              {def.glyph} Jump there
            </button>
            <button
              type="button"
              className="toy-btn toy-btn--ghost"
              onClick={() => {
                dismiss();
                if (!muted) sfx("click");
              }}
            >
              Keep flying
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */

export function Hud() {
  const phase = useGame((s) => s.phase);
  const current = useGame((s) => s.current);
  const visited = useGame((s) => s.visited);
  const muted = useGame((s) => s.muted);
  const time = useGame((s) => s.time);
  const raining = useGame((s) => s.raining);
  const turbo = useGame((s) => s.turbo);
  const devMode = useGame((s) => s.devMode);
  const stars = useGame((s) => s.starsFound.length);
  const panelOpen = useGame((s) => s.panelOpen);
  const destination = useGame((s) => s.destination);
  const isTouch = useGame((s) => s.isTouch);

  const launch = useGame((s) => s.launch);
  const warpTo = useGame((s) => s.warpTo);
  const toggleMute = useGame((s) => s.toggleMute);
  const toggleTime = useGame((s) => s.toggleTime);
  const setRain = useGame((s) => s.setRain);
  const openPanel = useGame((s) => s.openPanel);
  const finishMission = useGame((s) => s.finishMission);
  const say = useGame((s) => s.say);

  const progress = useGame(selectProgress);
  const allVisited = useGame(selectAllVisited);

  const visible = phase === "flying" || phase === "landed";
  const flying = phase === "flying";

  useEffect(() => {
    setMuted(muted);
  }, [muted]);

  return (
    <>
      <Checkpoint />

      <AnimatePresence>
        {visible && (
          <>
            {/* ---------- top bar ---------- */}
            <motion.div
              key="top"
              className="hud-top"
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="hud-brand">
                <span className="hud-brand__badge" aria-hidden="true">
                  ✈
                </span>
                <span className="hud-brand__text">
                  <span className="hud-brand__name">{profile.fullName}</span>
                  <span className="hud-brand__role">{profile.title}</span>
                </span>
              </div>

              <div className="hud-right">
                <div className="hud-tools">
                  <button
                    type="button"
                    className="icon-btn"
                    data-on={!muted}
                    onClick={() => {
                      toggleMute();
                      if (muted) sfx("click");
                    }}
                    aria-label={muted ? "Unmute sound" : "Mute sound"}
                    title={muted ? "Sound off" : "Sound on"}
                  >
                    {muted ? "🔇" : "🔊"}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-on={time === "night"}
                    onClick={() => {
                      toggleTime();
                      if (!muted) sfx("chime");
                    }}
                    aria-label={time === "day" ? "Switch to night" : "Switch to day"}
                    title="Day / night"
                  >
                    {time === "day" ? "☀️" : "🌙"}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    data-on={raining}
                    onClick={() => {
                      setRain(!raining);
                      setRainAudio(!raining);
                      if (!muted) sfx("click");
                    }}
                    aria-label={raining ? "Stop the rain" : "Make it rain"}
                    title="Weather"
                  >
                    {raining ? "🌧️" : "☁️"}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => {
                      say(
                        isTouch
                          ? "Use the stick to steer and the throttle to speed up. Fly over a glowing landing pad to touch down."
                          : "Arrow keys or WASD to fly. ↑ throttle, ↓ brake, ←→ turn. Fly over a glowing landing pad to land. Click a marker to set your heading.",
                        "info"
                      );
                      if (!muted) sfx("click");
                    }}
                    aria-label="Help and controls"
                    title="Controls"
                  >
                    ?
                  </button>
                </div>

                <div className="hud-progress" role="status" aria-live="polite">
                  <span>
                    {visited.filter((v) => MISSION_ISLANDS.includes(v)).length}/
                    {MISSION_ISLANDS.length} logged
                  </span>
                  <span className="hud-progress__track">
                    <motion.span
                      className="hud-progress__fill"
                      animate={{ width: `${progress * 100}%` }}
                      transition={{ type: "spring", stiffness: 90, damping: 18 }}
                    />
                  </span>
                  <span title={`${stars} of ${STAR_TOTAL} stars found`}>
                    ⭐ {stars}/{STAR_TOTAL}
                  </span>
                  {turbo && <span title="Turbo mode">⚡</span>}
                  {devMode && <span title="Developer mode">⌘</span>}
                </div>
              </div>
            </motion.div>

            {flying && <Instruments />}
            <ApproachBanner />
            <JumpPrompt />

            {/* ---------- destination selector ---------- */}
            <motion.nav
              key="bottom"
              className="hud-bottom"
              aria-label="Destinations"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0, scale: panelOpen ? 0.94 : 1 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
            >
              {ISLANDS.map((def, i) => {
                const here = current === def.id;
                const isTarget = destination === def.id;
                const seen = visited.includes(def.id);
                return (
                  <span key={def.id} className="contents">
                    {i > 0 && <span className="hop-sep" aria-hidden="true" />}
                    <button
                      type="button"
                      className="hop"
                      data-here={here}
                      data-target={isTarget && !here}
                      style={{ ["--accent" as string]: def.accent }}
                      disabled={here}
                      onClick={() => {
                        warpTo(def.id);
                        if (!muted) sfx("click");
                      }}
                      onPointerEnter={() => !muted && !here && sfx("hover")}
                      aria-current={here ? "true" : undefined}
                      aria-label={`Travel to ${def.label}. ${
                        here ? "You are here." : seen ? "Visited." : "Not yet visited."
                      }`}
                      title={here ? "You are here" : `Travel to ${def.label} — ${def.tagline}`}
                    >
                      <span className="hop__glyph" aria-hidden="true">
                        {def.glyph}
                      </span>
                      <span className="hop__label">
                        {def.label.replace(/ (Airport|Island|City|Lab|Kingdom|Museum)$/, "")}
                      </span>
                      {seen && !here && <span className="hop__dot" aria-hidden="true" />}
                    </button>
                  </span>
                );
              })}
            </motion.nav>

            {/* ---------- contextual actions ---------- */}
            {phase === "landed" && (
              <motion.div
                key="actions"
                className="hud-actions"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 18 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              >
                {current && !panelOpen && (
                  <button
                    type="button"
                    className="toy-btn"
                    onClick={() => {
                      openPanel();
                      if (!muted) sfx("unfold");
                    }}
                  >
                    Explore {ISLAND_MAP[current].label}
                  </button>
                )}
                {allVisited && current === "contact" ? (
                  <button
                    type="button"
                    className="toy-btn toy-btn--tomato"
                    onClick={() => {
                      finishMission();
                      if (!muted) sfx("stamp");
                    }}
                  >
                    🎉 Complete the mission
                  </button>
                ) : (
                  !panelOpen && (
                    <button
                      type="button"
                      className="toy-btn toy-btn--mint"
                      onClick={() => {
                        launch();
                        if (!muted) sfx("power");
                      }}
                    >
                      ✈ Take off
                    </button>
                  )
                )}
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </>
  );
}
