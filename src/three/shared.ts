import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Shared geometry + material instances.
 *
 * The world contains a few thousand meshes. Every unique material is a
 * shader program compile and a draw-call state change; every unique
 * geometry is a buffer upload. Sharing them is the single highest-leverage
 * thing we do for frame time, so anything used more than twice lives here.
 */

/* --- geometry ----------------------------------------------------- */

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLo: new THREE.SphereGeometry(1, 10, 7),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 18),
  coneLo: new THREE.ConeGeometry(1, 1, 8),
  torus: new THREE.TorusGeometry(1, 0.34, 8, 20),
  plane: new THREE.PlaneGeometry(1, 1),
  circle: new THREE.CircleGeometry(1, 32),
  /** Tapered cylinder used for tree trunks, chimneys, columns. */
  taper: new THREE.CylinderGeometry(0.7, 1, 1, 12),
} as const;

/* --- material factory --------------------------------------------- */

const cache = new Map<string, THREE.MeshStandardMaterial>();

type MatOpts = {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  flat?: boolean;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** For merged geometry that carries its part colours as vertex colours. */
  vertexColors?: boolean;
};

/**
 * Toy-plastic surface: high roughness, zero metal, saturated colour.
 * Handles the entire world except glass and glowing things.
 */
export function mat(color: string, o: MatOpts = {}) {
  const key = `${color}|${JSON.stringify(o)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.roughness ?? 0.72,
    metalness: o.metalness ?? 0,
    flatShading: o.flat ?? false,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
    emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: o.emissiveIntensity ?? 1,
  });
  cache.set(key, m);
  return m;
}

/** Emissive-only surface for lamps, windows, runway lights, neon. */
export function glow(color: string, intensity = 1.6) {
  return mat(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
}

/** Toy glass — canopies, museum cases, windows. */
const glassCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function glass(color = "#BFE8FF", opacity = 0.32) {
  const key = `${color}|${opacity}`;
  const hit = glassCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    roughness: 0.06,
    metalness: 0,
    transmission: 0,
    ior: 1.4,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  glassCache.set(key, m);
  return m;
}

/* ------------------------------------------------------------------ */
/* Geometry merging                                                    */
/* ------------------------------------------------------------------ */

export type Part = {
  geo: THREE.BufferGeometry;
  color: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
};

const _m4 = new THREE.Matrix4();
const _q4 = new THREE.Quaternion();
const _e4 = new THREE.Euler();
const _v4 = new THREE.Vector3();
const _s4 = new THREE.Vector3();

/**
 * Bakes a group of sub-meshes into ONE geometry, with each part's colour
 * written into vertex colours.
 *
 * This is the difference between a tree costing five draw calls and costing
 * a share of one. Anything that is static relative to its parent, repeated
 * many times, and made of a handful of primitives belongs here — merge it,
 * then instance the result.
 *
 * All parts must agree on their attribute set, so uv is dropped: nothing in
 * this world is textured except the mission board, which is not merged.
 */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map((p) => {
    const g = p.geo.clone();
    if (g.attributes.uv) g.deleteAttribute("uv");
    if (g.attributes.uv1) g.deleteAttribute("uv1");

    _e4.set(...(p.rotation ?? [0, 0, 0]));
    _q4.setFromEuler(_e4);
    _v4.set(...(p.position ?? [0, 0, 0]));
    const s = p.scale ?? 1;
    _s4.set(...(typeof s === "number" ? ([s, s, s] as [number, number, number]) : s));
    g.applyMatrix4(_m4.compose(_v4, _q4, _s4));

    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    const c = new THREE.Color(p.color);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    return g;
  });

  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) throw new Error("mergeParts: geometries had mismatched attributes");
  merged.computeBoundingSphere();
  return merged;
}

/** Frees everything on unmount — this app can be replayed, not reloaded. */
export function disposeShared() {
  Object.values(G).forEach((g) => g.dispose());
  cache.forEach((m) => m.dispose());
  glassCache.forEach((m) => m.dispose());
  cache.clear();
  glassCache.clear();
}

/* --- palette ------------------------------------------------------ */

export const PALETTE = {
  planeBody: "#E8553F",
  planeBodyDark: "#C33C2C",
  planeCream: "#FDF3E3",
  planeGold: "#FFC65C",
  wood: "#C08A4E",
  woodLight: "#DEA867",
  woodDark: "#8A5F35",
  rubber: "#3C3A44",
  leaf: "#4FB865",
  leafDark: "#2F8B4C",
  leafLight: "#8BE08F",
  grass: "#7ED08B",
  soil: "#8C6B4E",
  rock: "#6E6B78",
  water: "#5FC4E8",
  cloud: "#FFFFFF",
  paper: "#FFF8EC",
  ink: "#4A3F35",
  gold: "#FFD277",
  steel: "#B9C2CE",
  steelDark: "#7A8595",
} as const;
