import * as THREE from "three";

/**
 * World layout.
 *
 * The islands form a loop in the sky: the journey leaves Home Airport,
 * arcs out through the career, and comes back around to Contact — so the
 * final approach lands you near where you started. Positions are the
 * *centre of the island's top surface*.
 */

export type IslandId =
  | "home"
  | "objective"
  | "skills"
  | "experience"
  | "projects"
  | "museum"
  | "contact";

export type IslandDef = {
  id: IslandId;
  /** Title used in the HUD map + landing card. */
  label: string;
  glyph: string;
  /** One-line subtitle shown on approach. */
  tagline: string;
  position: THREE.Vector3;
  /** Radius of the flat top surface. */
  radius: number;
  /** Where the plane parks, relative to island centre. */
  pad: THREE.Vector3;
  /** Heading (radians) the plane should be facing when parked. */
  padHeading: number;
  /** Grass / top-surface colour. */
  topColor: string;
  /** Cliff + underside rock colour. */
  rockColor: string;
  /** Accent used for UI chrome, lights, and the HUD marker. */
  accent: string;
  /** Camera distance while parked — bigger islands need to breathe. */
  orbitRadius: number;
  orbitHeight: number;
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const ISLANDS: IslandDef[] = [
  {
    id: "home",
    label: "Home Airport",
    glyph: "🏠",
    tagline: "Where every flight begins.",
    position: V(0, 0, 0),
    radius: 17,
    pad: V(0, 0, 4),
    padHeading: 0,
    topColor: "#8FD98A",
    rockColor: "#9B7B5A",
    accent: "#FFC65C",
    orbitRadius: 26,
    orbitHeight: 13,
  },
  {
    id: "objective",
    label: "Objective Island",
    glyph: "🎯",
    tagline: "The mission briefing.",
    position: V(74, 10, -62),
    radius: 17,
    pad: V(2, 0, 5),
    padHeading: -0.5,
    topColor: "#7ED08B",
    rockColor: "#8C6B4E",
    accent: "#6FD3A3",
    orbitRadius: 27,
    orbitHeight: 13,
  },
  {
    id: "skills",
    label: "Skills Lab",
    glyph: "⚙️",
    tagline: "Twenty-two machines, all running.",
    position: V(168, -6, -18),
    radius: 19,
    pad: V(-1, 0, 8),
    padHeading: 0.25,
    topColor: "#A9B6C6",
    rockColor: "#6E6B78",
    accent: "#7FE3F0",
    orbitRadius: 30,
    orbitHeight: 15,
  },
  {
    id: "experience",
    label: "Experience City",
    glyph: "🏢",
    tagline: "Two towers. Two years.",
    position: V(214, 16, -128),
    radius: 19,
    pad: V(0, 0, 10),
    padHeading: 0.1,
    topColor: "#9DA9BC",
    rockColor: "#5F5C6B",
    accent: "#FF9E7A",
    orbitRadius: 31,
    orbitHeight: 17,
  },
  {
    id: "projects",
    label: "Project Kingdom",
    glyph: "🏗️",
    tagline: "Four systems, in production.",
    position: V(112, 4, -212),
    radius: 26,
    pad: V(0, 0, 15),
    padHeading: 0,
    topColor: "#8ED497",
    rockColor: "#7E6549",
    accent: "#FFB24D",
    orbitRadius: 40,
    orbitHeight: 21,
  },
  {
    id: "museum",
    label: "Achievement Museum",
    glyph: "🏆",
    tagline: "Mind the glass.",
    position: V(-14, 20, -168),
    radius: 18,
    pad: V(0, 0, 9),
    padHeading: -0.15,
    topColor: "#D8C9A8",
    rockColor: "#8A7452",
    accent: "#FFD277",
    // Pulled back: the rotunda's dome is 12 units tall and swallowed the
    // frame from the standard parked distance.
    orbitRadius: 36,
    orbitHeight: 19,
  },
  {
    id: "contact",
    label: "Contact Airport",
    glyph: "📬",
    tagline: "Outbound mail only.",
    position: V(-86, 6, -66),
    radius: 18,
    pad: V(0, 0, 7),
    padHeading: 0.4,
    topColor: "#8FD3C4",
    rockColor: "#7A7F8C",
    accent: "#6FC7FF",
    orbitRadius: 28,
    orbitHeight: 14,
  },
];

export const ISLAND_MAP: Record<IslandId, IslandDef> = ISLANDS.reduce(
  (acc, i) => ((acc[i.id] = i), acc),
  {} as Record<IslandId, IslandDef>
);

/** The islands that count toward "Mission Complete" (Home is the hangar). */
export const MISSION_ISLANDS: IslandId[] = [
  "objective",
  "skills",
  "experience",
  "projects",
  "museum",
  "contact",
];

/**
 * Islands float, so they rise and fall — very slowly, out of phase with
 * each other. Both the island mesh and the parked aeroplane read this same
 * function, which is the only reason the plane doesn't sink through the pad.
 */
export const islandBob = (def: IslandDef, t: number) =>
  Math.sin(t * 0.26 + def.position.x * 0.07 + def.position.z * 0.05) * 0.4;

/** Absolute world-space parking spot for an island. */
export const padWorld = (def: IslandDef) =>
  new THREE.Vector3().copy(def.position).add(def.pad);

/** The suggested next stop, so the HUD can nudge without forcing. */
export function nextStop(visited: Set<IslandId>): IslandId | null {
  for (const id of MISSION_ISLANDS) if (!visited.has(id)) return id;
  return null;
}

/** Rough centre of the whole archipelago — used for the overview shot. */
export const WORLD_CENTER = V(90, 6, -105);
