"use client";

import { useEffect, useRef } from "react";
import { flight } from "@/lib/flight";
import { useGame } from "@/lib/store";
import { ISLAND_MAP } from "@/data/world";

/**
 * The warp flash.
 *
 * Its whole job is to hide one frame — the frame on which the aeroplane and
 * the camera are teleported. The flash peaks exactly on that cut, so the
 * relocation happens behind a wall of light and reads as a fold in space
 * rather than a jump in state.
 *
 * Driven straight from `flight.warpFlash` on an animation frame. Routing a
 * value that changes every frame through React state would re-render the
 * tree sixty times a second to animate one gradient.
 */
export function WarpOverlay() {
  const warping = useGame((s) => s.warping);
  const layer = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (!warping) {
      if (layer.current) layer.current.style.opacity = "0";
      return;
    }
    const tick = () => {
      const f = flight.warpFlash;
      const el = layer.current;
      if (el) {
        el.style.opacity = String(f);
        // Streaks stretch as the fold tightens, then relax on the way out.
        el.style.setProperty("--warp", f.toFixed(3));
      }
      if (label.current) {
        label.current.style.opacity = String(Math.min(1, f * 1.6));
        label.current.style.transform = `translate(-50%,-50%) scale(${0.94 + f * 0.1})`;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [warping]);

  if (!warping) return null;
  const def = ISLAND_MAP[warping];

  return (
    <div className="warp" ref={layer} aria-hidden="true">
      <div className="warp__streaks" />
      <div className="warp__core" />
      <div className="warp__label" ref={label}>
        <span className="warp__glyph">{def.glyph}</span>
        <span className="warp__name">{def.label}</span>
      </div>
    </div>
  );
}
