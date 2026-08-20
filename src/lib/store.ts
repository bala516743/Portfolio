"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { ISLAND_MAP, MISSION_ISLANDS, nextStop, type IslandId } from "@/data/world";

/**
 * Discrete game state only.
 *
 * Anything that changes every frame — plane transform, camera, particles,
 * airspeed — deliberately lives outside React in `flight.ts`. React owns
 * *decisions*; the render loop owns *motion*.
 */

export type Phase =
  /** Toy airplane assembly loader. */
  | "boot"
  /** Parked at Home Airport, engine idling, waiting for Start Journey. */
  | "ready"
  /** Airborne — the pilot has the controls. */
  | "flying"
  /** Wheels down on an island, content available. */
  | "landed"
  /** Final runway scene. */
  | "complete";

export type TimeOfDay = "day" | "night";

type GameState = {
  phase: Phase;
  current: IslandId | null;
  /** The mission objective — the island the HUD is pointing you toward. */
  destination: IslandId | null;
  visited: IslandId[];
  panelOpen: boolean;
  /** Set for a few seconds after first landing on an island. */
  celebrating: IslandId | null;

  time: TimeOfDay;
  raining: boolean;
  rainbow: boolean;
  turbo: boolean;
  devMode: boolean;
  muted: boolean;
  reducedMotion: boolean;
  lowPower: boolean;
  isTouch: boolean;

  /** A jump has been offered after idling; the prompt is showing. */
  jumpOffered: boolean;
  /** Island currently being warped to, or null. */
  warping: IslandId | null;

  starsFound: number[];
  toast: { id: number; text: string; tone: "info" | "reward" | "system" } | null;

  activeSkill: string | null;
  activeCategory: string | null;
  openProject: string | null;
  openCompany: string | null;
  openAchievement: string | null;
  letterSent: boolean;

  bootProgress: number;
};

type GameActions = {
  setPhase: (p: Phase) => void;
  setBootProgress: (n: number) => void;
  /** Loader finished → the airport is live and waiting. */
  ready: () => void;
  /** START JOURNEY / taking off again from an island. */
  launch: () => void;
  /** Called by the flight system the instant the wheels settle. */
  arrive: (id: IslandId) => void;
  /** Pick a mission objective — the HUD arrow points at it. */
  setDestination: (id: IslandId | null) => void;
  clearCelebration: () => void;

  openPanel: () => void;
  closePanel: () => void;
  finishMission: () => void;
  replay: () => void;

  offerJump: () => void;
  dismissJump: () => void;
  /** Fold away and reassemble at `id`. The plane never flies there. */
  warpTo: (id: IslandId) => void;

  toggleTime: () => void;
  setRain: (v: boolean) => void;
  setRainbow: (v: boolean) => void;
  toggleTurbo: () => void;
  enableDevMode: () => void;
  toggleMute: () => void;
  setReducedMotion: (v: boolean) => void;
  setLowPower: (v: boolean) => void;
  setIsTouch: (v: boolean) => void;

  collectStar: (i: number) => void;
  say: (text: string, tone?: "info" | "reward" | "system") => void;
  clearToast: () => void;

  setActiveSkill: (id: string | null) => void;
  setActiveCategory: (id: string | null) => void;
  setOpenProject: (id: string | null) => void;
  setOpenCompany: (id: string | null) => void;
  setOpenAchievement: (id: string | null) => void;
  sendLetter: () => void;
};

const initial: GameState = {
  phase: "boot",
  current: "home",
  destination: "objective",
  visited: [],
  panelOpen: false,
  celebrating: null,
  time: "day",
  raining: false,
  rainbow: false,
  turbo: false,
  devMode: false,
  muted: false,
  reducedMotion: false,
  lowPower: false,
  isTouch: false,
  jumpOffered: false,
  warping: null,
  starsFound: [],
  toast: null,
  activeSkill: null,
  activeCategory: null,
  openProject: null,
  openCompany: null,
  openAchievement: null,
  letterSent: false,
  bootProgress: 0,
};

let toastId = 0;

export const useGame = create<GameState & GameActions>()(
  subscribeWithSelector((set, get) => ({
    ...initial,

    setPhase: (phase) => set({ phase }),
    setBootProgress: (bootProgress) => set({ bootProgress }),

    ready: () => set({ phase: "ready", bootProgress: 1 }),

    launch: () => {
      const s = get();
      if (s.phase !== "ready" && s.phase !== "landed") return;
      set({
        phase: "flying",
        current: null,
        panelOpen: false,
        jumpOffered: false,
        warping: null,
        activeSkill: null,
        activeCategory: null,
        openProject: null,
        openCompany: null,
        openAchievement: null,
      });
    },

    arrive: (id) => {
      const s = get();
      const first = !s.visited.includes(id);
      const visited = first ? [...s.visited, id] : s.visited;
      const remaining = MISSION_ISLANDS.filter((m) => !visited.includes(m));

      const wasWarp = s.warping === id;

      set({
        phase: "landed",
        current: id,
        visited,
        warping: null,
        jumpOffered: false,
        // Celebrate only the first arrival at a given island.
        celebrating: first && MISSION_ISLANDS.includes(id) ? id : null,
        destination: nextStop(new Set(visited)) ?? (remaining.length === 0 ? "contact" : null),
      });

      // A jump is a request to *see* a section, so its panel opens itself —
      // just late enough that the arrival animation reads first.
      if (wasWarp) {
        setTimeout(() => {
          const g = useGame.getState();
          if (g.phase === "landed" && g.current === id) g.openPanel();
        }, 480);
      }

      if (first && MISSION_ISLANDS.includes(id)) {
        setTimeout(() => {
          if (useGame.getState().celebrating === id) useGame.setState({ celebrating: null });
        }, 4200);
      }
      if (id !== "home" && remaining.length === 0) {
        setTimeout(() => {
          if (useGame.getState().phase === "landed") {
            useGame
              .getState()
              .say("Every island logged. Land at Contact Airport to complete the mission.", "reward");
          }
        }, 2600);
      }
    },

    setDestination: (destination) => set({ destination }),
    clearCelebration: () => set({ celebrating: null }),

    openPanel: () => set({ panelOpen: true }),
    closePanel: () =>
      set({
        panelOpen: false,
        openProject: null,
        openCompany: null,
        openAchievement: null,
        activeSkill: null,
        activeCategory: null,
      }),

    // Dusk falls for the finale: fireworks, runway lights and a lit control
    // tower all need a dark sky to read against.
    finishMission: () => set({ phase: "complete", panelOpen: false, time: "night" }),

    replay: () =>
      set({
        ...initial,
        // Preferences survive a replay; discoveries do not.
        muted: get().muted,
        reducedMotion: get().reducedMotion,
        lowPower: get().lowPower,
        isTouch: get().isTouch,
        devMode: get().devMode,
        phase: "ready",
        bootProgress: 1,
      }),

    offerJump: () => {
      const s = get();
      if (s.phase !== "flying" || s.warping || s.jumpOffered) return;
      set({ jumpOffered: true });
    },
    dismissJump: () => set({ jumpOffered: false }),

    warpTo: (id) => {
      const s = get();
      if (s.warping || s.phase === "boot" || s.phase === "complete") return;
      // Already standing there: just show the panel rather than warping in place.
      if (s.current === id && s.phase === "landed") {
        set({ panelOpen: true, destination: id });
        return;
      }
      set({
        warping: id,
        destination: id,
        panelOpen: false,
        jumpOffered: false,
        activeSkill: null,
        activeCategory: null,
        openProject: null,
        openCompany: null,
        openAchievement: null,
      });
    },

    toggleTime: () => set((s) => ({ time: s.time === "day" ? "night" : "day" })),
    setRain: (raining) => set({ raining }),
    setRainbow: (rainbow) => set({ rainbow }),
    toggleTurbo: () => set((s) => ({ turbo: !s.turbo })),
    enableDevMode: () => set({ devMode: true }),
    toggleMute: () => set((s) => ({ muted: !s.muted })),
    setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    setLowPower: (lowPower) => set({ lowPower }),
    setIsTouch: (isTouch) => set({ isTouch }),

    collectStar: (i) =>
      set((s) => (s.starsFound.includes(i) ? s : { starsFound: [...s.starsFound, i] })),

    say: (text, tone = "info") => set({ toast: { id: ++toastId, text, tone } }),
    clearToast: () => set({ toast: null }),

    setActiveSkill: (activeSkill) => set({ activeSkill }),
    setActiveCategory: (activeCategory) => set({ activeCategory }),
    setOpenProject: (openProject) => set({ openProject }),
    setOpenCompany: (openCompany) => set({ openCompany }),
    setOpenAchievement: (openAchievement) => set({ openAchievement }),
    sendLetter: () => set({ letterSent: true }),
  }))
);

/* ------------------------------------------------------------------ */
/* Derived selectors                                                   */
/* ------------------------------------------------------------------ */

export const selectProgress = (s: GameState) =>
  s.visited.filter((v) => MISSION_ISLANDS.includes(v)).length / MISSION_ISLANDS.length;

export const selectAllVisited = (s: GameState) =>
  MISSION_ISLANDS.every((m) => s.visited.includes(m));

export const selectCurrentDef = (s: GameState) => (s.current ? ISLAND_MAP[s.current] : null);
