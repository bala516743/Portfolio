"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import { G, glass, mat, mergeParts } from "../shared";
import { Island } from "../world/Island";
import { Trees, GrassField, type TreeKind } from "../props/Nature";
import { Motes } from "../effects/Motes";
import { ISLAND_MAP } from "@/data/world";
import { experiences, type Experience } from "@/data/resume";
import { useGame } from "@/lib/store";
import { sfx } from "@/lib/audio";
import { Spring, hash } from "@/lib/math";
import { lampLevel } from "../world/daylight";

/**
 * Experience City — two campuses, deliberately kept apart.
 *
 * CDAC and HEPL each get their own plot, their own gate, their own outbuildings
 * and their own sign, on opposite sides of the island with a road between
 * them. Nothing about either is shown alongside the other: visiting one
 * should feel like visiting a different office, which is exactly why the old
 * single combined timeline was replaced.
 */

const def = ISLAND_MAP.experience;

const CAMPUSES: Record<string, { pos: [number, number, number]; rot: number; variant: "tower" | "workshop" }> = {
  cdac: { pos: [-9.5, 0, -8.5], rot: 0.72, variant: "tower" },
  hepl: { pos: [10, 0, 7], rot: -2.35, variant: "workshop" },
};

/* ------------------------------------------------------------------ */
/* Windows — one instanced mesh per building                           */
/* ------------------------------------------------------------------ */

function Windows({
  rows,
  cols,
  width,
  depth,
  bottom,
  spacingY,
}: {
  rows: number;
  cols: number;
  width: number;
  depth: number;
  bottom: number;
  spacingY: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#7FBBE0"),
        emissive: new THREE.Color("#FFD98A"),
        emissiveIntensity: 0,
        roughness: 0.18,
        metalness: 0.1,
      }),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const total = rows * cols * 4;

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    let n = 0;
    const faces: [number, number, number][] = [
      [0, 0, depth / 2 + 0.02],
      [0, Math.PI, -depth / 2 - 0.02],
      [width / 2 + 0.02, Math.PI / 2, 0],
      [-width / 2 - 0.02, -Math.PI / 2, 0],
    ];
    for (let f = 0; f < 4; f++) {
      const [fx, ry, fz] = faces[f];
      const span = f < 2 ? width : depth;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const t = cols === 1 ? 0.5 : c / (cols - 1);
          const off = (t - 0.5) * (span - 1.1);
          dummy.position.set(f < 2 ? off : fx, bottom + r * spacingY, f < 2 ? fz : off);
          dummy.rotation.set(0, ry, 0);
          dummy.scale.set(0.62, 0.72, 0.06);
          dummy.updateMatrix();
          m.setMatrixAt(n++, dummy.matrix);
        }
      }
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [rows, cols, width, depth, bottom, spacingY, dummy]);

  useFrame(({ clock }) => {
    // Lights come on at dusk, and a few flicker as people move about.
    const lamp = lampLevel();
    const flick = 0.9 + Math.sin(clock.elapsedTime * 1.7) * 0.1;
    material.emissiveIntensity = lamp * 2.6 * flick;
    material.color.setRGB(0.5 - lamp * 0.2, 0.73 - lamp * 0.2, 0.88 - lamp * 0.1);
  });

  return <instancedMesh ref={ref} args={[G.box, material, total]} />;
}

/* ------------------------------------------------------------------ */
/* A company campus                                                    */
/* ------------------------------------------------------------------ */

function Campus({ exp }: { exp: Experience }) {
  const site = CAMPUSES[exp.id];
  const openCompany = useGame((s) => s.openCompany);
  const setOpenCompany = useGame((s) => s.setOpenCompany);
  const openPanel = useGame((s) => s.openPanel);
  const current = useGame((s) => s.current);
  const muted = useGame((s) => s.muted);

  const open = openCompany === exp.id;
  const parked = current === "experience";
  const hovered = useRef(false);
  const doorL = useRef<THREE.Group>(null);
  const doorR = useRef<THREE.Group>(null);
  const lobby = useRef<THREE.PointLight>(null);
  const radar = useRef<THREE.Group>(null);
  const signMat = useRef<THREE.MeshStandardMaterial>(null);
  const spring = useMemo(() => new Spring(0, 5.5, 0.7), []);
  const hoverSpring = useMemo(() => new Spring(0, 9, 0.5), []);

  const tower = site.variant === "tower";
  const H = tower ? 11 : 5.6;
  const W = tower ? 4.6 : 8.2;
  const D = tower ? 4.6 : 5.4;
  const wall = tower ? "#C8D2E0" : "#E8DCC8";
  const trim = tower ? "#5E6B80" : "#B07C46";

  const postRing = useMemo(() => {
    const parts = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      // Leave a gap at the front for the gate.
      if (a > 1.05 && a < 2.1) continue;
      parts.push({
        geo: G.cylLo,
        color: "#FFF6E8",
        position: [Math.cos(a) * (W + 6.5), 0.5, Math.sin(a) * (W + 6.5)] as [number, number, number],
        scale: [0.09, 1, 0.09] as [number, number, number],
      });
    }
    return mergeParts(parts);
  }, [W]);

  useFrame((_, dt) => {
    const v = spring.step(open ? 1 : 0, dt);
    const h = hoverSpring.step(hovered.current && parked ? 1 : 0, dt);
    // Doors slide into the walls rather than swinging — these are lobbies.
    if (doorL.current) doorL.current.position.x = -0.62 - v * 1.02;
    if (doorR.current) doorR.current.position.x = 0.62 + v * 1.02;
    if (lobby.current) lobby.current.intensity = v * 14 + h * 3 + lampLevel() * 2;
    if (radar.current) radar.current.rotation.y += dt * 0.85;
    if (signMat.current) {
      signMat.current.emissiveIntensity = 0.5 + (open ? 2.2 : 0.6) + lampLevel() * 2;
    }
  });

  return (
    <group position={site.pos} rotation={[0, site.rot, 0]}>
      {/* --- the plot: each campus stands on its own ground --------- */}
      <mesh geometry={G.cyl} material={mat("#9AA3B0", { roughness: 0.9 })} position={[0, 0.06, 0]}
        scale={[W + 7, 0.12, W + 7]} receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.13, 0]}>
        <ringGeometry args={[W + 6.2, W + 6.9, 44]} />
        <meshStandardMaterial color={exp.accent} roughness={0.7} />
      </mesh>

      {/* boundary posts, so the two plots never bleed into each other —
          merged into one ring rather than fourteen separate posts */}
      <mesh geometry={postRing} material={mat("#FFF6E8", { roughness: 0.85, vertexColors: true })}
        castShadow />

      {/* --- main building ------------------------------------------ */}
      <mesh geometry={G.box} material={mat(wall, { roughness: 0.7 })} position={[0, H / 2, 0]}
        scale={[W, H, D]} castShadow receiveShadow />
      {Array.from({ length: Math.floor(H / 2.2) }, (_, i) => (
        <mesh key={i} geometry={G.box} material={mat(trim, { roughness: 0.6 })}
          position={[0, 2.0 + i * 2.2, 0]} scale={[W + 0.14, 0.16, D + 0.14]} />
      ))}

      <Windows rows={tower ? 4 : 2} cols={tower ? 3 : 5} width={W} depth={D} bottom={3.2} spacingY={2.2} />

      {/* roof kit — the silhouettes are deliberately unmistakable */}
      {tower ? (
        <>
          <mesh geometry={G.box} material={mat(trim, { roughness: 0.6 })} position={[0, H + 0.3, 0]}
            scale={[W + 0.5, 0.6, D + 0.5]} castShadow />
          <mesh geometry={G.cylLo} material={mat("#8E99AB", { metalness: 0.5, roughness: 0.35 })}
            position={[0, H + 2.2, 0]} scale={[0.09, 3.4, 0.09]} />
          {/* the radar that never stops turning */}
          <group ref={radar} position={[0, H + 0.9, 0]}>
            <mesh geometry={G.cylLo} material={mat("#5E6B80", { metalness: 0.4 })} scale={[0.18, 0.5, 0.18]} />
            <mesh material={mat("#DCE4EE", { roughness: 0.3, metalness: 0.2 })} position={[0, 0.55, 0]}
              rotation={[0.5, 0, 0]}>
              <sphereGeometry args={[0.85, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
            </mesh>
          </group>
          <mesh geometry={G.sphereLo} position={[0, H + 3.9, 0]} scale={0.16}>
            <meshStandardMaterial color="#FF4D4D" emissive="#FF4D4D" emissiveIntensity={3} />
          </mesh>
        </>
      ) : (
        <>
          {[-2.4, 0, 2.4].map((x) => (
            <mesh key={x} geometry={G.cone} material={mat("#C05C4A", { roughness: 0.8 })}
              position={[x, H + 0.75, 0]} rotation={[0, Math.PI / 4, 0]}
              scale={[2.0, 1.5, D * 0.78]} castShadow />
          ))}
          <mesh geometry={G.cyl} material={mat("#9A8A78", { roughness: 0.85 })}
            position={[3.1, H + 1.9, -1.6]} scale={[0.42, 2.6, 0.42]} castShadow />
        </>
      )}

      {/* --- entrance ------------------------------------------------ */}
      <group position={[0, 0, D / 2 + 0.02]}>
        <mesh geometry={G.box} material={mat("#2B3140", { roughness: 1 })} position={[0, 1.3, -0.35]}
          scale={[2.6, 2.6, 0.6]} />
        <pointLight ref={lobby} position={[0, 1.5, -0.5]} color="#FFD79A" intensity={0} distance={9}
          decay={2} />
        <group ref={doorL} position={[-0.62, 1.3, 0.06]}>
          <mesh geometry={G.box} material={glass("#BFE8FF", 0.55)} scale={[1.2, 2.5, 0.08]} />
          <mesh geometry={G.box} material={mat(trim, { metalness: 0.4, roughness: 0.35 })}
            position={[0, 0, 0.06]} scale={[1.26, 0.1, 0.06]} />
        </group>
        <group ref={doorR} position={[0.62, 1.3, 0.06]}>
          <mesh geometry={G.box} material={glass("#BFE8FF", 0.55)} scale={[1.2, 2.5, 0.08]} />
          <mesh geometry={G.box} material={mat(trim, { metalness: 0.4, roughness: 0.35 })}
            position={[0, 0, 0.06]} scale={[1.26, 0.1, 0.06]} />
        </group>
        <mesh geometry={G.box} material={mat(trim, { roughness: 0.6 })} position={[0, 2.75, 0.5]}
          scale={[3.6, 0.18, 1.4]} castShadow />
        {[0, 1].map((i) => (
          <mesh key={i} geometry={G.box} material={mat("#C6CEDA", { roughness: 0.85 })}
            position={[0, 0.09 + i * 0.14, 0.7 + i * 0.34]} scale={[3.2, 0.16, 0.7]} receiveShadow />
        ))}
      </group>

      {/* --- the company sign at the gate --------------------------- */}
      <group position={[0, 0, W + 5.4]} rotation={[0, Math.PI, 0]}>
        {[-1.6, 1.6].map((x) => (
          <mesh key={x} geometry={G.cylLo} material={mat("#7C8698", { metalness: 0.4, roughness: 0.5 })}
            position={[x, 0.9, 0]} scale={[0.11, 1.8, 0.11]} castShadow />
        ))}
        <mesh geometry={G.box} position={[0, 2.1, 0]} scale={[4.2, 1.2, 0.18]} castShadow>
          <meshStandardMaterial ref={signMat} color={exp.accent} emissive={exp.accent}
            emissiveIntensity={0.6} roughness={0.45} />
        </mesh>
        <Html center distanceFactor={17} position={[0, 2.1, -0.16]} rotation={[0, Math.PI, 0]}
          zIndexRange={[16, 0]} className="pointer-events-none">
          <span className="gate-sign">
            <strong>{exp.shortName}</strong>
            <em>{exp.period}</em>
          </span>
        </Html>
      </group>

      {/* --- outbuildings, so a campus is more than one block -------- */}
      {[
        [-(W / 2 + 3.2), 0, 2.6],
        [W / 2 + 3.4, 0, -2.2],
      ].map(([x, , z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, i ? 0.4 : -0.3, 0]}>
          <mesh geometry={G.box} material={mat(i ? "#DCE2EC" : "#EFE2D2", { roughness: 0.78 })}
            position={[0, 1.1, 0]} scale={[2.6, 2.2, 2.2]} castShadow receiveShadow />
          <mesh geometry={G.box} material={mat(trim, { roughness: 0.7 })} position={[0, 2.3, 0]}
            scale={[2.8, 0.24, 2.4]} castShadow />
          <Windows rows={1} cols={2} width={2.6} depth={2.2} bottom={1.2} spacingY={1} />
        </group>
      ))}

      {/* generous hit volume: precision-clicking a building from a moving
          camera is not fun */}
      <mesh
        position={[0, H / 2, 0]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          if (!parked) return;
          setOpenCompany(open ? null : exp.id);
          openPanel();
          if (!muted) sfx(open ? "click" : "unfold");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!parked) return;
          hovered.current = true;
          document.body.style.cursor = "pointer";
          if (!muted) sfx("hover");
        }}
        onPointerOut={() => {
          hovered.current = false;
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[W + 3, H + 1, D + 3]} />
      </mesh>

      <Html center distanceFactor={30} position={[0, H + (tower ? 5.4 : 3.8), 0]} zIndexRange={[16, 0]}
        className="pointer-events-none">
        <span className="building-tag" data-open={open} style={{ ["--c" as string]: exp.accent }}>
          <strong>{exp.company}</strong>
          <em>{open ? "Open" : "Enter"}</em>
        </span>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The road that runs between the two campuses                         */
/* ------------------------------------------------------------------ */

function Road() {
  const cars = useRef<THREE.Group>(null);
  const COUNT = 5;
  const colors = ["#E8553F", "#4C9BD6", "#F2B441", "#6BBF7F", "#FFFFFF"];

  useFrame(({ clock }) => {
    if (!cars.current) return;
    const t = clock.elapsedTime;
    cars.current.children.forEach((c, i) => {
      // Shuttle back and forth along the connecting road.
      const p = (t * 0.09 + i / COUNT) % 1;
      const along = -16 + p * 32;
      c.position.set(along * 0.72, 0.22, along * 0.62);
      c.rotation.y = Math.atan2(0.72, 0.62) + Math.PI / 2;
    });
  });

  return (
    <>
      <mesh geometry={G.box} material={mat("#5A6070", { roughness: 0.95 })} position={[0, 0.05, 0]}
        rotation={[0, -0.71, 0]} scale={[3, 0.08, 34]} receiveShadow />
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} geometry={G.box} material={mat("#F2E4C0", { roughness: 0.9 })}
          position={[(-14 + i * 2.2) * 0.72, 0.1, (-14 + i * 2.2) * 0.62]} rotation={[0, -0.71, 0]}
          scale={[0.16, 0.03, 1.1]} />
      ))}
      <group ref={cars}>
        {Array.from({ length: COUNT }, (_, i) => (
          <group key={i}>
            <mesh geometry={G.box} material={mat(colors[i], { roughness: 0.35 })}
              scale={[0.44, 0.26, 0.86]} castShadow />
            <mesh geometry={G.box} material={glass("#CFEFFF", 0.6)} position={[0, 0.2, -0.04]}
              scale={[0.36, 0.22, 0.44]} />
          </group>
        ))}
      </group>
    </>
  );
}

/**
 * Street lamp.
 *
 * Emissive bulb plus an additive glow sprite — deliberately *not* a real
 * light. Five lamps meant five more dynamic lights that every lit surface in
 * the world had to iterate over, for a pool of illumination the camera never
 * gets close enough to appreciate. The glow quad sells it for free.
 */
function StreetLamp({ position }: { position: [number, number, number] }) {
  const m = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const l = lampLevel();
    if (m.current) m.current.emissiveIntensity = l * 4;
    if (halo.current) {
      (halo.current.material as THREE.Material).opacity = l * 0.22;
      halo.current.visible = l > 0.02;
    }
  });
  return (
    <group position={position}>
      <mesh geometry={G.cylLo} material={mat("#4A5261", { metalness: 0.4, roughness: 0.5 })}
        position={[0, 1.1, 0]} scale={[0.06, 2.2, 0.06]} castShadow />
      <mesh geometry={G.box} material={mat("#4A5261", { metalness: 0.4 })} position={[0.24, 2.2, 0]}
        scale={[0.5, 0.07, 0.07]} />
      <mesh geometry={G.sphereLo} position={[0.46, 2.13, 0]} scale={[0.14, 0.1, 0.14]}>
        <meshStandardMaterial ref={m} color="#FFF3C4" emissive="#FFD98A" emissiveIntensity={0} />
      </mesh>
      <mesh ref={halo} geometry={G.sphereLo} position={[0.46, 2.1, 0]} scale={0.7} visible={false}>
        <meshBasicMaterial color="#FFD79A" transparent opacity={0} depthWrite={false}
          blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function ExperienceCity() {
  const R = def.radius;

  return (
    <Island def={def}>
      <GrassField radius={R - 1.6} count={430} color="#84C48E" seed={51} exclude={5} />

      <Road />
      {experiences.map((e) => (
        <Campus key={e.id} exp={e} />
      ))}

      {[
        [0, 12.5],
        [-3.5, 3.5],
        [3.5, -3.5],
        [11, -6],
        [-11, 6],
      ].map(([x, z], i) => (
        <StreetLamp key={i} position={[x, 0.1, z]} />
      ))}

      {/* a small park between the two plots */}
      <Trees
        items={Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 + 0.5;
          const r = R - 3.4;
          return {
            position: [Math.cos(a) * r, 0, Math.sin(a) * r] as [number, number, number],
            scale: 0.75 + hash(i * 5.1) * 0.5,
            kind: (hash(i * 3.3) > 0.6 ? "pine" : "round") as TreeKind,
          };
        })}
      />

      <Motes count={50} area={[R * 1.5, 8, R * 1.5]} color="#FFD79A" size={4} speed={0.4} opacity={0.4} />
    </Island>
  );
}
