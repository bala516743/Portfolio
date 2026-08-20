"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { memo, useMemo, useRef, type ReactNode } from "react";
import { G, mat } from "../shared";
import { islandBob, type IslandDef } from "@/data/world";
import { useGame } from "@/lib/store";
import { flight } from "@/lib/flight";
import { hash, Spring } from "@/lib/math";
import { lampLevel } from "./daylight";
import { sfx } from "@/lib/audio";

/**
 * The floating landmass every island is built on.
 *
 * Top plate, cliff band, a broken rock keel underneath, and a handful of
 * chunks that never quite fell. The whole thing rises and falls on the same
 * clock the parked aeroplane reads, so the plane rides the island rather
 * than hovering next to it.
 */

/* ------------------------------------------------------------------ */
/* Landing pad                                                         */
/* ------------------------------------------------------------------ */

const GREEN = new THREE.Color("#5CFF8F");

function LandingPad({ def }: { def: IslandDef }) {
  const ring = useRef<THREE.Mesh>(null);
  const destination = useGame((s) => s.destination);
  const visited = useGame((s) => s.visited).includes(def.id);
  const incoming = destination === def.id;

  const lightMats = useMemo(
    () =>
      Array.from({ length: 8 }, () =>
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(def.accent),
          emissive: new THREE.Color(def.accent),
          emissiveIntensity: 1,
          roughness: 0.4,
        })
      ),
    [def.accent]
  );

  const accent = useMemo(() => new THREE.Color(def.accent), [def.accent]);
  const lit = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    // Sequenced approach lights: they chase around the pad, faster and
    // brighter when this is your objective. Once an island is logged they
    // settle to a steady green — the checkpoint marker.
    lit.copy(accent).lerp(GREEN, visited ? 1 : 0);
    const speed = incoming ? 5.5 : 1.6;
    for (let i = 0; i < lightMats.length; i++) {
      const p = ((t * speed - i * 0.5) % 8) / 8;
      const on = visited ? 0.7 : p < 0.14 ? 1 : 0.12;
      lightMats[i].emissiveIntensity = 0.35 + on * (incoming ? 5 : 2) + lampLevel() * 1.2;
      lightMats[i].color.copy(lit);
      lightMats[i].emissive.copy(lit);
    }
    if (ring.current) {
      const s = 1 + Math.sin(t * (incoming ? 4 : 1.4)) * (incoming ? 0.045 : 0.015);
      ring.current.scale.set(s, s, 1);
      const m = ring.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = (incoming ? 2.4 : 0.7) + lampLevel();
      m.color.copy(lit);
      m.emissive.copy(lit);
    }
  });

  return (
    <group position={[def.pad.x, 0.04, def.pad.z]}>
      {/* deck */}
      <mesh geometry={G.cyl} material={mat("#4E5768", { roughness: 0.85 })} scale={[3.4, 0.09, 3.4]}
        receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.052, 0]}>
        <ringGeometry args={[2.5, 3.1, 40]} />
        <meshStandardMaterial color="#E9E4D8" roughness={0.8} />
      </mesh>
      {/* pulsing target ring */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.056, 0]}>
        <ringGeometry args={[1.5, 1.85, 36]} />
        <meshStandardMaterial
          color={def.accent}
          emissive={def.accent}
          emissiveIntensity={0.7}
          roughness={0.5}
        />
      </mesh>
      {/* chevrons pointing along the runway heading */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, def.padHeading]} position={[0, 0.054, 0]}>
          <ringGeometry args={[0.5 + i * 0.32, 0.66 + i * 0.32, 12, 1, Math.PI * 0.75, Math.PI * 0.5]} />
          <meshStandardMaterial color="#FFF6E0" roughness={0.7} />
        </mesh>
      ))}
      {/* perimeter approach lights */}
      {lightMats.map((m, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} geometry={G.sphereLo} material={m}
            position={[Math.cos(a) * 3.5, 0.14, Math.sin(a) * 3.5]} scale={0.13} />
        );
      })}

      {/* Checkpoint flag — planted the first time you land here. */}
      {visited && <Checkpoint accent={def.accent} />}
    </group>
  );
}

/** The flag that marks a logged island. Rises once, then waves. */
function Checkpoint({ accent }: { accent: string }) {
  const group = useRef<THREE.Group>(null);
  const cloth = useRef<THREE.Mesh>(null);
  const grow = useMemo(() => new Spring(0, 6, 0.45), []);

  useFrame(({ clock }, dt) => {
    const s = grow.step(1, dt);
    if (group.current) group.current.scale.set(1, Math.max(0.001, s), 1);
    if (cloth.current) {
      // Cheap flutter: skew the flag with a travelling sine.
      cloth.current.rotation.y = Math.sin(clock.elapsedTime * 3.1) * 0.22;
      cloth.current.position.x = 0.42 + Math.sin(clock.elapsedTime * 2.4) * 0.03;
    }
  });

  return (
    <group ref={group} position={[2.9, 0.05, 2.9]}>
      <mesh geometry={G.cylLo} material={mat("#E9E4D8", { roughness: 0.5, metalness: 0.3 })}
        position={[0, 1.1, 0]} scale={[0.045, 2.2, 0.045]} castShadow />
      <mesh ref={cloth} geometry={G.box}
        material={mat("#5CFF8F", { roughness: 0.6, emissive: "#2FBF63", emissiveIntensity: 0.5 })}
        position={[0.42, 1.85, 0]} scale={[0.82, 0.5, 0.03]} castShadow />
      <mesh geometry={G.sphereLo} material={mat(accent, { roughness: 0.35 })}
        position={[0, 2.24, 0]} scale={0.09} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Floating marker — sets the mission objective                        */
/* ------------------------------------------------------------------ */

function Marker({ def }: { def: IslandDef }) {
  const phase = useGame((s) => s.phase);
  const current = useGame((s) => s.current);
  const visited = useGame((s) => s.visited);
  const destination = useGame((s) => s.destination);
  const warpTo = useGame((s) => s.warpTo);
  const say = useGame((s) => s.say);
  const muted = useGame((s) => s.muted);
  const group = useRef<THREE.Group>(null);
  const seen = visited.includes(def.id);
  const isTarget = destination === def.id;

  const hidden = phase === "boot" || current === def.id;

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.position.y =
      def.radius * 0.25 + 9.5 + Math.sin(clock.elapsedTime * 0.9 + def.position.x) * 0.35;
  });

  if (hidden) return null;

  return (
    <group ref={group}>
      {/* distanceFactor scales the label with range; 44 keeps it legible
          from the far side of the archipelago without ballooning up close. */}
      <Html center distanceFactor={44} zIndexRange={[30, 0]} className="pointer-events-none">
        <button
          type="button"
          className="island-marker pointer-events-auto"
          data-seen={seen}
          data-target={isTarget}
          style={{ ["--accent" as string]: def.accent }}
          onClick={(e) => {
            e.stopPropagation();
            if (!muted) sfx("click");
            // Selecting a destination warps you there. Flying it yourself is
            // still available — this is the deliberate, fast path.
            warpTo(def.id);
          }}
          onPointerEnter={() => {
            if (!muted) sfx("hover");
          }}
          aria-label={`Travel to ${def.label}. ${def.tagline}${
            seen ? " Already visited." : ""
          }`}
        >
          <span className="island-marker__glyph" aria-hidden="true">
            {def.glyph}
          </span>
          <span className="island-marker__body">
            <span className="island-marker__label">{def.label}</span>
            <span className="island-marker__tag">
              {isTarget ? "Objective" : seen ? "Visited" : def.tagline}
            </span>
          </span>
          {seen && (
            <span className="island-marker__check" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The landmass                                                        */
/* ------------------------------------------------------------------ */

const KEEL = new THREE.DodecahedronGeometry(1, 0);

/** Darken/lighten a hex colour, keeping it a valid `#rrggbb` string. */
export const shade = (hex: string, k: number) =>
  "#" + new THREE.Color(hex).multiplyScalar(k).getHexString();

const Landmass = memo(function Landmass({ def }: { def: IslandDef }) {
  const rock = mat(def.rockColor, { flat: true, roughness: 0.95 });
  // Only slightly darker than the soil band. Going properly dark here is
  // physically right and visually wrong: from below — which is most of the
  // flight — the islands turn into black lozenges.
  const rockDark = mat(shade(def.rockColor, 0.84), { flat: true, roughness: 0.96 });
  const top = mat(def.topColor, { roughness: 0.9 });
  const R = def.radius;

  // Deterministic keel chunks — same shape on every visit.
  const chunks = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = hash(i * 3.1 + R) * Math.PI * 2;
        const r = hash(i * 5.7 + R) * R * 0.62;
        return {
          pos: [Math.cos(a) * r, -2.4 - hash(i * 2.3) * 7.5, Math.sin(a) * r] as [
            number,
            number,
            number
          ],
          scale: 0.9 + hash(i * 7.3) * 2.6,
          rot: [hash(i) * 3, hash(i * 2) * 3, hash(i * 4) * 3] as [number, number, number],
        };
      }),
    [R]
  );

  return (
    <group>
      {/* grass plate */}
      <mesh geometry={G.cyl} material={top} position={[0, -0.35, 0]} scale={[R, 0.7, R]}
        receiveShadow castShadow />
      {/* soil band, slightly wider so it reads as an overhang */}
      <mesh geometry={G.cyl} material={rock} position={[0, -1.5, 0]} scale={[R * 0.99, 1.7, R * 0.99]}
        castShadow receiveShadow />
      {/* the keel — a broken cone, not a smooth one */}
      <mesh geometry={G.cone} material={rockDark} position={[0, -6.4, 0]} rotation={[Math.PI, 0, 0]}
        scale={[R * 0.92, 10, R * 0.92]} castShadow />
      <mesh geometry={G.cone} material={rock} position={[0, -3.4, 0]} rotation={[Math.PI, 0, 0]}
        scale={[R * 0.75, 5.5, R * 0.75]} />
      {chunks.map((c, i) => (
        <mesh key={i} geometry={KEEL} material={i % 2 ? rock : rockDark} position={c.pos}
          rotation={c.rot} scale={c.scale} castShadow />
      ))}
      {/* grass lip spilling over the cliff edge */}
      <mesh geometry={G.cyl} material={top} position={[0, -0.72, 0]} scale={[R * 1.02, 0.2, R * 1.02]} />
    </group>
  );
});

/* ------------------------------------------------------------------ */

export function Island({
  def,
  children,
  pad = true,
  marker = true,
}: {
  def: IslandDef;
  children?: ReactNode;
  pad?: boolean;
  marker?: boolean;
}) {
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    group.current.position.y = def.position.y + islandBob(def, t);
    // A whisper of roll, so it reads as buoyant rather than bolted to the sky.
    group.current.rotation.z = Math.sin(t * 0.19 + def.position.z * 0.03) * 0.006;
    group.current.rotation.x = Math.cos(t * 0.23 + def.position.x * 0.03) * 0.006;
  });

  return (
    <group ref={group} position={def.position}>
      <Landmass def={def} />
      {pad && <LandingPad def={def} />}
      {children}
      {marker && <Marker def={def} />}
    </group>
  );
}
