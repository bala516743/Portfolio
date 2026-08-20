"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/store";
import { setTouchAxis, setTouchThrottle, resetTouch } from "@/lib/input";

/**
 * Touch controls: a steering stick on the left, a throttle on the right.
 *
 * Both use pointer capture so a thumb that slides off the pad keeps its
 * grip — losing the aeroplane because your thumb drifted two pixels outside
 * a circle is the fastest way to make a control scheme feel broken.
 *
 * The stick returns to centre on a spring rather than snapping, matching the
 * way the aeroplane itself unwinds out of a turn.
 */

function Stick() {
  const pad = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const vec = useRef({ x: 0, y: 0 });
  const raf = useRef(0);

  const apply = useCallback((x: number, y: number) => {
    vec.current = { x, y };
    setTouchAxis(x, y);
    if (knob.current) {
      knob.current.style.transform = `translate(${x * 34}px, ${-y * 34}px)`;
    }
  }, []);

  const onDown = (e: React.PointerEvent) => {
    active.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onMove(e);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!active.current || !pad.current) return;
    const r = pad.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const radius = r.width / 2;
    let dx = (e.clientX - cx) / radius;
    let dy = -(e.clientY - cy) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    // Dead zone: a resting thumb should not creep the nose round.
    const dead = 0.14;
    const shape = (v: number) => (Math.abs(v) < dead ? 0 : (v - Math.sign(v) * dead) / (1 - dead));
    apply(shape(dx), shape(dy));
  };

  const onUp = () => {
    active.current = false;
    // Spring the knob home rather than snapping it.
    const decay = () => {
      const { x, y } = vec.current;
      const nx = x * 0.82;
      const ny = y * 0.82;
      if (Math.hypot(nx, ny) < 0.01) {
        apply(0, 0);
        return;
      }
      apply(nx, ny);
      raf.current = requestAnimationFrame(decay);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(decay);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div
      ref={pad}
      className="stick"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="application"
      aria-label="Steering stick"
    >
      <span className="stick__ring" aria-hidden="true" />
      <span className="stick__cross" aria-hidden="true" />
      <div ref={knob} className="stick__knob" aria-hidden="true" />
    </div>
  );
}

function Throttle() {
  const [on, setOn] = useState(false);
  const hold = useRef(0);
  const raf = useRef(0);

  const ramp = useCallback((up: boolean) => {
    cancelAnimationFrame(raf.current);
    const step = () => {
      // Throttle eases in and out, so a tap is a nudge and a hold is a climb.
      const target = up ? 1 : 0;
      hold.current += (target - hold.current) * 0.14;
      setTouchThrottle(hold.current);
      if (Math.abs(target - hold.current) > 0.01) {
        raf.current = requestAnimationFrame(step);
      } else {
        setTouchThrottle(target);
      }
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      type="button"
      className="throttle"
      data-on={on}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setOn(true);
        ramp(true);
      }}
      onPointerUp={() => {
        setOn(false);
        ramp(false);
      }}
      onPointerCancel={() => {
        setOn(false);
        ramp(false);
      }}
      aria-label="Throttle"
    >
      <span className="throttle__glyph" aria-hidden="true">
        ▲
      </span>
      <span className="throttle__label">THROTTLE</span>
    </button>
  );
}

export function TouchControls() {
  const isTouch = useGame((s) => s.isTouch);
  const phase = useGame((s) => s.phase);
  const panelOpen = useGame((s) => s.panelOpen);
  const warping = useGame((s) => s.warping);
  // Hidden mid-warp: the flight model ignores input during a jump, and
  // leaving live-looking controls on screen that do nothing is worse than
  // showing none at all.
  const show = isTouch && phase === "flying" && !panelOpen && !warping;

  useEffect(() => {
    if (!show) resetTouch();
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="touch-controls"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <Stick />
          <Throttle />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
