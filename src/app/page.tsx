"use client";

import dynamic from "next/dynamic";
import { Loader } from "@/ui/Loader";
import { StartScreen } from "@/ui/StartScreen";
import { TouchControls } from "@/ui/TouchControls";
import { Hud } from "@/ui/Hud";
import { Panel } from "@/ui/Panel";
import { Toast } from "@/ui/Toast";
import { WarpOverlay } from "@/ui/WarpOverlay";
import { MissionComplete } from "@/ui/MissionComplete";
import { EasterEggs } from "@/ui/EasterEggs";
import { AccessibleResume } from "@/ui/AccessibleResume";

/**
 * The whole site is one page and one continuous camera shot.
 *
 * The WebGL scene is client-only and code-split: the first paint is the
 * loader (a few kB of SVG), and three.js streams in behind it while the
 * aeroplane is being assembled. Nothing here ever scrolls.
 */
const Experience = dynamic(() => import("@/three/Experience").then((m) => m.Experience), {
  ssr: false,
});

export default function Page() {
  return (
    <main>
      <div className="stage">
        <Experience />
      </div>

      <div className="grade" aria-hidden="true" />

      <div className="overlay">
        <StartScreen />
        <Hud />
        <TouchControls />
        <Panel />
        <MissionComplete />
        <WarpOverlay />
        <Toast />
      </div>

      <Loader />
      <EasterEggs />

      {/* The real résumé, for crawlers, screen readers, and anyone who would
          simply rather read it. Present in the DOM from the first byte. */}
      <AccessibleResume />
    </main>
  );
}
