"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { G, mat, mergeParts } from "../shared";
import { Flock } from "./Flock";
import { hash, wobble } from "@/lib/math";
import { WORLD_CENTER } from "@/data/world";
import { useGame } from "@/lib/store";
import { lampLevel } from "./daylight";

/* ------------------------------------------------------------------ */
/* HOT AIR BALLOONS                                                    */
/* ------------------------------------------------------------------ */

/**
 * A balloon envelope: eight 45° gores baked into one geometry with their
 * alternating colours written in as vertex colours. Six balloons used to be
 * forty-eight draw calls; they are now six.
 */
const GORE = new THREE.SphereGeometry(1, 6, 12, 0, Math.PI / 4);
const envelopeCache = new Map<string, THREE.BufferGeometry>();

function envelopeGeometry(a: string, b: string) {
  const key = `${a}|${b}`;
  const hit = envelopeCache.get(key);
  if (hit) return hit;
  const g = mergeParts(
    Array.from({ length: 8 }, (_, i) => ({
      geo: GORE,
      color: i % 2 ? a : b,
      rotation: [0, (i / 8) * Math.PI * 2, 0] as [number, number, number],
      scale: [3.2, 4.0, 3.2] as [number, number, number],
    }))
  );
  envelopeCache.set(key, g);
  return g;
}

const ENVELOPE_MAT_KEY = { roughness: 0.85, vertexColors: true } as const;

const BALLOON_COLORS: [string, string][] = [
  ["#E8553F", "#FFF3E0"],
  ["#4C9BD6", "#FFF3E0"],
  ["#F2B441", "#FFF3E0"],
  ["#6BBF7F", "#FFF3E0"],
  ["#B77CD9", "#FFF3E0"],
];

function Balloon({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null);
  // The burner is emissive, not a real light. Six balloons meant six more
  // dynamic lights for every lit fragment in the world, to illuminate a
  // basket nobody ever flies close to.
  const burner = useRef<THREE.MeshStandardMaterial>(null);
  const [a, b] = BALLOON_COLORS[index % BALLOON_COLORS.length];

  const base = useMemo(() => {
    const ang = hash(index * 3.3) * Math.PI * 2;
    const r = 90 + hash(index * 7.1) * 170;
    return new THREE.Vector3(
      WORLD_CENTER.x + Math.cos(ang) * r,
      WORLD_CENTER.y + 14 + hash(index * 5.5) * 46,
      WORLD_CENTER.z + Math.sin(ang) * r
    );
  }, [index]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime * 0.055 + index * 1.7;
    // A slow, wide drift plus a gentle vertical breathe.
    g.position.set(
      base.x + Math.cos(t) * 40,
      base.y + wobble(clock.elapsedTime * 0.22, index) * 3.2,
      base.z + Math.sin(t * 0.8) * 34
    );
    g.rotation.y = t * 0.6;
    g.rotation.z = Math.sin(clock.elapsedTime * 0.4 + index) * 0.035;

    if (burner.current) {
      // The burner fires in bursts, not continuously.
      const fire = Math.max(0, Math.sin(clock.elapsedTime * 0.6 + index * 2.1) - 0.75) * 4;
      burner.current.emissiveIntensity = 0.3 + fire * 6 + lampLevel() * 1.5;
    }
  });

  return (
    <group ref={group}>
      {/* envelope — eight gores, one draw call */}
      <mesh geometry={envelopeGeometry(a, b)} material={mat("#FFFFFF", ENVELOPE_MAT_KEY)} castShadow />
      <mesh geometry={G.cone} material={mat(a, { roughness: 0.85 })} position={[0, -3.4, 0]}
        rotation={[Math.PI, 0, 0]} scale={[1.5, 1.4, 1.5]} />
      {/* ropes */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={G.cylLo} material={mat("#6B5B4A")}
          position={[Math.cos((i / 4) * Math.PI * 2) * 0.6, -5.0, Math.sin((i / 4) * Math.PI * 2) * 0.6]}
          scale={[0.03, 1.6, 0.03]} />
      ))}
      {/* basket */}
      <mesh geometry={G.box} material={mat("#B98A55", { roughness: 0.9 })} position={[0, -5.9, 0]}
        scale={[1.3, 1.0, 1.3]} castShadow />
      <mesh geometry={G.box} material={mat("#8A5F35", { roughness: 0.9 })} position={[0, -5.42, 0]}
        scale={[1.42, 0.12, 1.42]} />
      <mesh geometry={G.sphereLo} position={[0, -4.9, 0]} scale={[0.3, 0.42, 0.3]}>
        <meshStandardMaterial ref={burner} color="#FFD9A0" emissive="#FFB347" emissiveIntensity={0.3}
          roughness={0.4} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* PAPER AEROPLANES                                                    */
/* ------------------------------------------------------------------ */

function PaperPlanes({ count = 10 }: { count?: number }) {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(() => mat("#FFF8EC", { roughness: 0.95, side: THREE.DoubleSide }), []);

  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        r: 70 + hash(i * 2.9) * 190,
        y: WORLD_CENTER.y - 10 + hash(i * 6.1) * 70,
        speed: 0.055 + hash(i * 9.3) * 0.06,
        phase: hash(i * 4.7) * Math.PI * 2,
        tilt: hash(i * 8.2) * 0.5,
      })),
    [count]
  );

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < g.children.length; i++) {
      const c = g.children[i];
      const s = seeds[i];
      const a = t * s.speed + s.phase;
      c.position.set(
        WORLD_CENTER.x + Math.cos(a) * s.r,
        s.y + Math.sin(t * 0.5 + s.phase) * 5,
        WORLD_CENTER.z + Math.sin(a) * s.r * 0.9
      );
      // Face the direction of travel, and roll into the turn.
      c.rotation.set(
        Math.sin(t * 0.7 + s.phase) * 0.22 - 0.1,
        -a + Math.PI / 2,
        Math.sin(t * 0.4 + s.phase) * 0.4 + s.tilt
      );
    }
  });

  return (
    <group ref={group}>
      {seeds.map((_, i) => (
        <group key={i}>
          <mesh material={material} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 1]}>
            <coneGeometry args={[0.5, 2.0, 3]} />
          </mesh>
          {/* the crease down the middle */}
          <mesh material={mat("#E8DFCE", { roughness: 0.95 })} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.02, 0.32, 1.8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function Life() {
  const lowPower = useGame((s) => s.lowPower);
  const balloons = lowPower ? 3 : 6;

  return (
    <>
      {Array.from({ length: balloons }, (_, i) => (
        <Balloon key={i} index={i} />
      ))}

      <PaperPlanes count={lowPower ? 5 : 10} />

      {/* Resident flock — circles the archipelago all day. Kept pale and
          small: dark silhouettes at this size read as debris, not birds. */}
      <Flock
        count={lowPower ? 24 : 54}
        kind="bird"
        center={[WORLD_CENTER.x, WORLD_CENTER.y + 34, WORLD_CENTER.z]}
        radius={130}
        vertical={14}
        speed={0.16}
        scale={0.95}
        color="#6B7893"
        colorB="#B4BFD2"
      />
      {/* Escort flock — peels off to fly with you the moment you take off.
          It orbits wide (see uFollow lag in Flock.tsx) so it never crowds
          the chase camera. */}
      <Flock
        count={lowPower ? 8 : 16}
        kind="bird"
        center={[WORLD_CENTER.x + 40, WORLD_CENTER.y + 16, WORLD_CENTER.z - 30]}
        radius={70}
        vertical={8}
        speed={0.3}
        scale={0.72}
        color="#7A6B57"
        colorB="#C7B79C"
        follow
      />
    </>
  );
}
