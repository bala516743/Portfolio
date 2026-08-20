"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useMemo, useRef, type ReactNode } from "react";
import { G, PALETTE, glass, mat, mergeParts } from "../shared";
import { Island } from "../world/Island";
import { Flowers, GrassField, Trees, Waterfall, type TreeKind } from "../props/Nature";
import { Puffs, type PuffHandle } from "../effects/Puffs";
import { Motes } from "../effects/Motes";
import { ISLAND_MAP } from "@/data/world";
import { projects, type Project } from "@/data/resume";
import { useGame } from "@/lib/store";
import { sfx } from "@/lib/audio";
import { Spring, hash } from "@/lib/math";
import { lampLevel } from "../world/daylight";

/**
 * Project Kingdom — the biggest island, four explorable buildings.
 *
 * Each building's *form* is an argument about what the project is: INDE-DDS
 * is a research lab with a dish, because it is middleware for people who
 * are not in the room. SWOOS is a warehouse, because it counts stock.
 * CONVEX is a permanent construction site, because sprints never finish.
 * NERAM is an office with a clock, because it is a timesheet.
 */

const def = ISLAND_MAP.projects;

const SITES: Record<string, { pos: [number, number, number]; rot: number }> = {
  indedds: { pos: [-14, 0, -12], rot: 0.62 },
  convex: { pos: [13, 0, -13], rot: -0.6 },
  swoos: { pos: [17.5, 0, 4], rot: -1.25 },
  neram: { pos: [-16.5, 0, 4], rot: 1.15 },
};

/* ------------------------------------------------------------------ */
/* Shared building shell: hit volume, roll-up door, interior glow, tag  */
/* ------------------------------------------------------------------ */

function Site({
  project,
  doorWidth = 3.2,
  doorHeight = 3,
  doorAt = [0, 0, 0],
  tagHeight,
  children,
}: {
  project: Project;
  doorWidth?: number;
  doorHeight?: number;
  doorAt?: [number, number, number];
  tagHeight: number;
  children: ReactNode;
}) {
  const openProject = useGame((s) => s.openProject);
  const setOpenProject = useGame((s) => s.setOpenProject);
  const openPanel = useGame((s) => s.openPanel);
  const current = useGame((s) => s.current);
  const muted = useGame((s) => s.muted);

  const open = openProject === project.id;
  const parked = current === "projects";
  const site = SITES[project.id];

  const shutter = useRef<THREE.Group>(null);
  const inner = useRef<THREE.PointLight>(null);
  const hovered = useRef(false);
  const spring = useMemo(() => new Spring(0, 5, 0.72), []);
  const hoverSpring = useMemo(() => new Spring(0, 10, 0.5), []);

  useFrame((_, dt) => {
    const v = spring.step(open ? 1 : 0, dt);
    const h = hoverSpring.step(hovered.current && parked ? 1 : 0, dt);
    if (shutter.current) {
      // A roller shutter: it scales up from the lintel and rides upward.
      shutter.current.scale.y = Math.max(0.001, 1 - v);
      shutter.current.position.y = doorHeight - (doorHeight * (1 - v)) / 2;
    }
    if (inner.current) inner.current.intensity = v * 16 + h * 4 + lampLevel() * 1.5;
  });

  const slats = 7;

  // Both of these are static relative to their parent, so they are baked once
  // per site instead of costing eleven draw calls each time a door is drawn.
  const shutterGeo = useMemo(
    () =>
      mergeParts(
        Array.from({ length: slats }, (_, i) => ({
          geo: G.box,
          color: i % 2 ? project.accentDark : "#8C97A8",
          position: [0, -doorHeight / 2 + (i + 0.5) * (doorHeight / slats), 0] as [number, number, number],
          scale: [doorWidth, doorHeight / slats - 0.03, 0.09] as [number, number, number],
        }))
      ),
    [project.accentDark, doorHeight, doorWidth]
  );

  const apronGeo = useMemo(
    () =>
      mergeParts([
        { geo: G.box, color: "#9AA3B0", position: [0, 0.03, 1.9], scale: [doorWidth + 1.4, 0.06, 3.4] },
        ...Array.from({ length: 6 }, (_, i) => ({
          geo: G.box,
          color: i % 2 ? "#F2B441" : "#3B4150",
          position: [-doorWidth / 2 + 0.3 + i * (doorWidth / 6), 0.07, 0.55] as [number, number, number],
          rotation: [0, 0.5, 0] as [number, number, number],
          scale: [0.3, 0.02, 0.8] as [number, number, number],
        })),
      ]),
    [doorWidth]
  );

  const slatMat = useMemo(
    () => mat("#FFFFFF", { roughness: 0.5, metalness: 0.4, vertexColors: true }),
    []
  );
  const apronMat = useMemo(() => mat("#FFFFFF", { roughness: 0.9, vertexColors: true }), []);

  return (
    <group position={site.pos} rotation={[0, site.rot, 0]}>
      {children}

      {/* --- doorway ------------------------------------------------ */}
      <group position={doorAt}>
        {/* dark interior */}
        <mesh geometry={G.box} material={mat("#22262F", { roughness: 1 })}
          position={[0, doorHeight / 2, -0.5]} scale={[doorWidth, doorHeight, 1]} />
        <pointLight ref={inner} position={[0, doorHeight * 0.6, -0.6]}
          color={project.accent} intensity={0} distance={12} decay={2} />
        {/* The shutter: seven slats baked into one geometry. It scales and
            rides as a unit, so there is nothing to gain from separate meshes. */}
        <group ref={shutter} position={[0, doorHeight / 2, 0.06]}>
          <mesh geometry={shutterGeo} material={slatMat} castShadow />
        </group>
        {/* lintel + jambs */}
        <mesh geometry={G.box} material={mat(project.accentDark, { roughness: 0.55 })}
          position={[0, doorHeight + 0.16, 0.06]} scale={[doorWidth + 0.5, 0.32, 0.24]} castShadow />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={G.box} material={mat(project.accentDark, { roughness: 0.55 })}
            position={[(s * (doorWidth + 0.24)) / 2, doorHeight / 2, 0.06]}
            scale={[0.24, doorHeight + 0.3, 0.24]} castShadow />
        ))}
        {/* apron and its painted hazard stripes — one merged slab */}
        <mesh geometry={apronGeo} material={apronMat} receiveShadow />
      </group>

      {/* --- interaction -------------------------------------------- */}
      <mesh
        position={[0, tagHeight * 0.45, 0]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          if (!parked) return;
          setOpenProject(open ? null : project.id);
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
        <boxGeometry args={[11, tagHeight, 11]} />
      </mesh>

      <Html center distanceFactor={30} position={[0, tagHeight, 0]} zIndexRange={[16, 0]}
        className="pointer-events-none">
        <span className="building-tag" data-open={open} style={{ ["--c" as string]: project.accent }}>
          <strong>{project.name}</strong>
          <em>{open ? "Open" : "Enter"}</em>
        </span>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* INDE-DDS — research laboratory                                      */
/* ------------------------------------------------------------------ */

function IndeDdsLab({ project }: { project: Project }) {
  const dish = useRef<THREE.Group>(null);
  const core = useRef<THREE.MeshStandardMaterial>(null);
  const rings = useRef<THREE.Group>(null);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (dish.current) {
      // Tracking something we can't see — the whole point of middleware.
      dish.current.rotation.y = Math.sin(t * 0.22) * 1.3;
      dish.current.rotation.x = -0.5 + Math.sin(t * 0.15) * 0.18;
    }
    if (core.current) core.current.emissiveIntensity = 1.8 + Math.sin(t * 3.1) * 0.9;
    if (rings.current) {
      rings.current.rotation.y += dt * 0.5;
      rings.current.children.forEach((c, i) => {
        c.rotation.x = t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1);
      });
    }
  });

  return (
    <Site project={project} tagHeight={9.5} doorWidth={2.8} doorHeight={2.8} doorAt={[0, 0, 4.05]}>
      <mesh geometry={G.cyl} material={mat("#D8E2EC", { roughness: 0.55 })} position={[0, 2, 0]}
        scale={[4, 4, 4]} castShadow receiveShadow />
      {/* dome */}
      <mesh material={mat("#E9F1F8", { roughness: 0.4, metalness: 0.1 })} position={[0, 4, 0]}
        castShadow>
        <sphereGeometry args={[4, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh geometry={G.torus} material={mat(project.accentDark, { roughness: 0.45, metalness: 0.3 })}
        position={[0, 4, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[4.05, 4.05, 0.06]} />

      {/* glowing core visible through a viewport */}
      <mesh geometry={G.box} material={glass("#BFF0FF", 0.4)} position={[0, 2.4, 4.02]}
        scale={[2.2, 1.2, 0.1]} />
      <group position={[0, 2.4, 1.4]}>
        <mesh geometry={G.sphere} scale={0.7}>
          <meshStandardMaterial ref={core} color={project.accent} emissive={project.accent}
            emissiveIntensity={2} roughness={0.2} />
        </mesh>
        <group ref={rings}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={G.torus} material={mat("#DCE8F2", { metalness: 0.5, roughness: 0.3 })}
              scale={[1.1 + i * 0.28, 1.1 + i * 0.28, 0.035]} />
          ))}
        </group>
        <pointLight color={project.accent} intensity={9} distance={11} decay={2} />
      </group>

      {/* satellite dish on a gantry */}
      <group position={[3.6, 4.6, -2.2]}>
        <mesh geometry={G.cylLo} material={mat("#8E99AB", { metalness: 0.5, roughness: 0.4 })}
          position={[0, 0.9, 0]} scale={[0.14, 1.8, 0.14]} castShadow />
        <group ref={dish} position={[0, 1.9, 0]}>
          <mesh material={mat("#F0F4F8", { roughness: 0.35, metalness: 0.15 })} castShadow>
            <sphereGeometry args={[1.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
          </mesh>
          <mesh geometry={G.cylLo} material={mat("#5E6B80")} position={[0, 0.9, 0]}
            scale={[0.05, 1.1, 0.05]} />
          <mesh geometry={G.sphereLo} material={mat("#E8553F")} position={[0, 1.4, 0]} scale={0.14} />
        </group>
      </group>

      {/* antenna array — three languages, three masts */}
      {[-3.4, -4.2, -3.0].map((x, i) => (
        <mesh key={i} geometry={G.cylLo} material={mat("#8E99AB", { metalness: 0.5, roughness: 0.4 })}
          position={[x, 3 + i * 0.6, -3.2 + i * 0.9]} scale={[0.05, 6 + i, 0.05]} castShadow />
      ))}
    </Site>
  );
}

/* ------------------------------------------------------------------ */
/* CONVEX — construction site                                          */
/* ------------------------------------------------------------------ */

function ConvexSite({ project }: { project: Project }) {
  const jib = useRef<THREE.Group>(null);
  const hook = useRef<THREE.Group>(null);
  const mixer = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (jib.current) jib.current.rotation.y = Math.sin(t * 0.16) * 1.5;
    if (hook.current) {
      // The load rises, swings across, and comes back down. Forever.
      hook.current.position.y = -2.4 - (Math.sin(t * 0.55) * 0.5 + 0.5) * 3.4;
      hook.current.rotation.y = t * 0.4;
    }
    if (mixer.current) mixer.current.rotation.z += dt * 1.4;
  });

  return (
    <Site project={project} tagHeight={11.5} doorWidth={3} doorHeight={3} doorAt={[0, 0, 3.05]}>
      {/* the half-built block */}
      <mesh geometry={G.box} material={mat("#C9CFD8", { roughness: 0.85 })} position={[0, 2.4, 0]}
        scale={[6, 4.8, 6]} castShadow receiveShadow />
      {/* exposed upper floor slabs, still open */}
      {[5.2, 6.6].map((y, i) => (
        <mesh key={y} geometry={G.box} material={mat("#B4BCC8", { roughness: 0.9 })}
          position={[0, y, 0]} scale={[6 - i * 0.6, 0.26, 6 - i * 0.6]} castShadow />
      ))}
      {/* columns of the next floor */}
      {([[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]] as const).map(([x, z]) => (
        <mesh key={`${x}${z}`} geometry={G.box} material={mat("#AAB2BE", { roughness: 0.9 })}
          position={[x, 7.4, z]} scale={[0.42, 1.5, 0.42]} castShadow />
      ))}
      {/* scaffolding */}
      <group position={[0, 0, 3.4]}>
        {[-2.6, -0.9, 0.9, 2.6].map((x) => (
          <mesh key={x} geometry={G.cylLo} material={mat("#E7A33E", { metalness: 0.4, roughness: 0.5 })}
            position={[x, 3, 0]} scale={[0.07, 6, 0.07]} castShadow />
        ))}
        {[1.4, 3.2, 5].map((y) => (
          <group key={y}>
            <mesh geometry={G.box} material={mat("#E7A33E", { metalness: 0.4, roughness: 0.5 })}
              position={[0, y, 0]} scale={[5.6, 0.09, 0.09]} />
            <mesh geometry={G.box} material={mat(PALETTE.wood, { roughness: 0.9 })}
              position={[0, y + 0.1, 0.2]} scale={[5.4, 0.07, 0.55]} />
          </group>
        ))}
      </group>

      {/* tower crane */}
      <group position={[-5.5, 0, -5]}>
        <mesh geometry={G.box} material={mat("#F2B441", { roughness: 0.6, metalness: 0.2 })}
          position={[0, 0.3, 0]} scale={[1.8, 0.6, 1.8]} castShadow />
        {/* lattice mast */}
        {([[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]] as const).map(([x, z]) => (
          <mesh key={`${x}${z}`} geometry={G.cylLo}
            material={mat("#F2B441", { roughness: 0.55, metalness: 0.25 })} position={[x, 5, z]}
            scale={[0.075, 9.4, 0.075]} castShadow />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} geometry={G.box} material={mat("#D89B2E", { roughness: 0.6 })}
            position={[0, 1.2 + i * 1.3, 0]} rotation={[0, Math.PI / 4, 0]}
            scale={[1.2, 0.07, 0.07]} />
        ))}
        <group ref={jib} position={[0, 9.9, 0]}>
          <mesh geometry={G.box} material={mat("#F2B441", { roughness: 0.55, metalness: 0.25 })}
            position={[2.6, 0, 0]} scale={[9.5, 0.24, 0.28]} castShadow />
          <mesh geometry={G.box} material={mat("#D89B2E", { roughness: 0.6 })}
            position={[-2.2, -0.1, 0]} scale={[2.4, 0.5, 0.5]} castShadow />
          <mesh geometry={G.box} material={mat("#5E6B80", { roughness: 0.5 })}
            position={[0, -0.42, 0]} scale={[0.8, 0.7, 0.8]} castShadow />
          <group ref={hook} position={[5.4, -2.4, 0]}>
            <mesh geometry={G.cylLo} material={mat("#4A5261")} position={[0, 1.2, 0]}
              scale={[0.02, 2.4, 0.02]} />
            <mesh geometry={G.box} material={mat("#C05C4A", { roughness: 0.6 })} scale={[0.9, 0.6, 0.9]}
              castShadow />
          </group>
        </group>
      </group>

      {/* girder stack, cones, mixer */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={G.box} material={mat("#8C97A8", { metalness: 0.4, roughness: 0.5 })}
          position={[4.6, 0.16 + i * 0.3, -2 + i * 0.2]} rotation={[0, 0.3, 0]}
          scale={[0.5, 0.28, 5]} castShadow />
      ))}
      {[[3.4, 3.4], [5, 2.6], [2.6, 4.6]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={G.cone} material={mat("#F26B3A", { roughness: 0.7 })} position={[0, 0.34, 0]}
            scale={[0.28, 0.68, 0.28]} castShadow />
          <mesh geometry={G.box} material={mat("#F26B3A", { roughness: 0.7 })} position={[0, 0.03, 0]}
            scale={[0.6, 0.06, 0.6]} />
        </group>
      ))}
      <group position={[5.8, 0, 1.5]} rotation={[0, -0.5, 0]}>
        <mesh geometry={G.box} material={mat("#4A5261", { roughness: 0.6 })} position={[0, 0.3, 0]}
          scale={[1.1, 0.6, 1.6]} castShadow />
        <mesh ref={mixer} geometry={G.cyl} material={mat("#F2B441", { roughness: 0.5, metalness: 0.2 })}
          position={[0, 1, 0]} rotation={[0, 0, 0.45]} scale={[0.7, 1.1, 0.7]} castShadow />
      </group>
    </Site>
  );
}

/* ------------------------------------------------------------------ */
/* SWOOS — warehouse                                                   */
/* ------------------------------------------------------------------ */

/** Fifteen crates with one gap — the out-of-stock this app exists to find. */
const CRATES = mergeParts(
  Array.from({ length: 16 }, (_, i) => ({ i }))
    .filter(({ i }) => i !== 6)
    .map(({ i }) => ({
      geo: G.box,
      color: ["#C9884B", "#B8763D", "#D69B5E", "#A86A34"][i % 4],
      position: [-6 + Math.floor(i / 4) * 1.3, 0.42 + (i % 4) * 0.86, 7.4] as [number, number, number],
      rotation: [0, hash(i) * 0.3, 0] as [number, number, number],
      scale: [1.1, 0.8, 1.1] as [number, number, number],
    }))
);

function SwoosWarehouse({ project }: { project: Project }) {
  const forklift = useRef<THREE.Group>(null);
  const forks = useRef<THREE.Group>(null);
  const crateMat = useMemo(() => mat("#FFFFFF", { roughness: 0.85, vertexColors: true }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (forklift.current) {
      // Shuttling between the racks and the bay door.
      const p = Math.sin(t * 0.32);
      forklift.current.position.set(4.2 + p * 3.4, 0, 5.4);
      forklift.current.rotation.y = p > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (forks.current) forks.current.position.y = 0.28 + (Math.sin(t * 0.64) * 0.5 + 0.5) * 0.9;
  });

  return (
    <Site project={project} tagHeight={8} doorWidth={3.4} doorHeight={3.2} doorAt={[-2.6, 0, 4.55]}>
      {/* shed */}
      <mesh geometry={G.box} material={mat("#DCE3EA", { roughness: 0.7, metalness: 0.1 })}
        position={[0, 2.4, 0]} scale={[11, 4.8, 9]} castShadow receiveShadow />
      {/* Corrugated roof running the long (X) axis of the shed. A rotation
          about Z lays the cylinder along X with its 0..π half on top. */}
      <mesh material={mat("#8FB8C9", { roughness: 0.5, metalness: 0.2 })} position={[0, 4.8, 0]}
        rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[4.8, 4.8, 11.2, 16, 1, false, 0, Math.PI]} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} material={mat("#7BA5B8", { roughness: 0.5, metalness: 0.2 })}
          position={[-4.8 + i * 1.6, 4.8, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[4.86, 4.86, 0.14, 16, 1, false, 0, Math.PI]} />
        </mesh>
      ))}
      {/* the two bays that don't open — the interactive one is the Site door */}
      {[1.2, 4.2].map((x) => (
        <group key={x} position={[x, 0, 4.55]}>
          <mesh geometry={G.box} material={mat("#7C8698", { roughness: 0.55, metalness: 0.35 })}
            position={[0, 1.6, 0]} scale={[2.4, 3.2, 0.14]} castShadow />
          {Array.from({ length: 5 }, (_, i) => (
            <mesh key={i} geometry={G.box} material={mat("#6B7486", { roughness: 0.6 })}
              position={[0, 0.32 + i * 0.64, 0.08]} scale={[2.4, 0.08, 0.06]} />
          ))}
          {/* loading dock lip */}
          <mesh geometry={G.box} material={mat("#4A5261", { roughness: 0.9 })} position={[0, 0.5, 0.5]}
            scale={[2.6, 1, 0.9]} castShadow />
        </group>
      ))}

      {/* the stock this thing exists to count — one merged stack */}
      <mesh geometry={CRATES} material={crateMat} castShadow />
      {/* the empty slot, flagged */}
      <group position={[-6 + 1 * 1.3, 0.42 + 2 * 0.86, 7.4]}>
        <mesh geometry={G.box} material={mat("#E8553F", { roughness: 0.6, emissive: "#E8553F", emissiveIntensity: 0.6 })}
          scale={[1.1, 0.06, 1.1]} />
      </group>

      {/* racking */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 3.5, 0, -2.5]}>
          {[0.9, 2.4, 3.9].map((y) => (
            <mesh key={y} geometry={G.box} material={mat("#F2B441", { roughness: 0.55, metalness: 0.3 })}
              position={[0, y, 0]} scale={[3.4, 0.12, 1.2]} castShadow />
          ))}
          {[-1.6, 1.6].map((x) => (
            <mesh key={x} geometry={G.box} material={mat("#4A5261", { roughness: 0.5, metalness: 0.4 })}
              position={[x, 2.2, 0]} scale={[0.16, 4.4, 1.2]} castShadow />
          ))}
        </group>
      ))}

      <group ref={forklift}>
        <mesh geometry={G.box} material={mat("#F2B441", { roughness: 0.45, metalness: 0.2 })}
          position={[0, 0.5, 0]} scale={[0.9, 0.7, 1.4]} castShadow />
        <mesh geometry={G.box} material={mat("#4A5261", { roughness: 0.5 })} position={[0, 1.05, -0.2]}
          scale={[0.8, 0.5, 0.7]} />
        <mesh geometry={G.box} material={mat("#8C97A8", { metalness: 0.5, roughness: 0.4 })}
          position={[0, 1.2, 0.75]} scale={[0.7, 2.2, 0.1]} castShadow />
        <group ref={forks} position={[0, 0.28, 1]}>
          {[-0.22, 0.22].map((x) => (
            <mesh key={x} geometry={G.box} material={mat("#C6CEDA", { metalness: 0.6, roughness: 0.35 })}
              position={[x, 0, 0.3]} scale={[0.12, 0.06, 0.9]} />
          ))}
        </group>
        {[-0.36, 0.36].map((x) =>
          [-0.45, 0.45].map((z) => (
            <mesh key={`${x}${z}`} geometry={G.cylLo} material={mat("#2B3140")}
              position={[x, 0.2, z]} rotation={[0, 0, Math.PI / 2]} scale={[0.2, 0.12, 0.2]} />
          ))
        )}
      </group>
    </Site>
  );
}

/* ------------------------------------------------------------------ */
/* NERAM — office block with a clock                                   */
/* ------------------------------------------------------------------ */

function NeramOffice({ project }: { project: Project }) {
  const min = useRef<THREE.Group>(null);
  const hr = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    // Runs at 60× real time: a working day compressed into a minute.
    const t = clock.elapsedTime;
    if (min.current) min.current.rotation.z = -t * 0.6;
    if (hr.current) hr.current.rotation.z = -t * 0.05;
    if (glowRef.current) glowRef.current.emissiveIntensity = 0.6 + lampLevel() * 2.6;
  });

  return (
    <Site project={project} tagHeight={10.5} doorWidth={2.6} doorHeight={2.8} doorAt={[0, 0, 3.55]}>
      <mesh geometry={G.box} material={mat("#E6E1F5", { roughness: 0.7 })} position={[0, 4.2, 0]}
        scale={[6.4, 8.4, 7]} castShadow receiveShadow />
      {/* glass curtain wall on the front */}
      <mesh geometry={G.box} material={glass("#CFE4FF", 0.42)} position={[0, 5, 3.52]}
        scale={[5.2, 5.6, 0.1]} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={G.box} material={mat(project.accentDark, { roughness: 0.5 })}
          position={[0, 2.6 + i * 1.4, 3.56]} scale={[5.4, 0.12, 0.16]} />
      ))}
      {[-1, 0, 1].map((i) => (
        <mesh key={i} geometry={G.box} material={mat(project.accentDark, { roughness: 0.5 })}
          position={[i * 1.75, 5, 3.56]} scale={[0.12, 5.6, 0.16]} />
      ))}
      {/* cornice + roof plant */}
      <mesh geometry={G.box} material={mat(project.accent, { roughness: 0.6 })} position={[0, 8.6, 0]}
        scale={[6.9, 0.5, 7.5]} castShadow />
      <mesh geometry={G.box} material={mat("#C8C2DC", { roughness: 0.7 })} position={[1.8, 9.3, -1.8]}
        scale={[2, 1, 2]} castShadow />

      {/* the clock: a timesheet building should tell the time */}
      <group position={[0, 6.4, 3.62]}>
        <mesh geometry={G.cyl} material={mat("#FFFDF5", { roughness: 0.4 })}
          rotation={[Math.PI / 2, 0, 0]} scale={[1.5, 0.1, 1.5]} castShadow />
        <mesh geometry={G.torus} position={[0, 0, 0.03]} rotation={[0, 0, 0]} scale={[1.5, 1.5, 0.09]}>
          <meshStandardMaterial ref={glowRef} color={project.accent} emissive={project.accent}
            emissiveIntensity={0.6} roughness={0.4} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} geometry={G.box} material={mat("#6B5B7A")}
            position={[
              Math.sin((i / 12) * Math.PI * 2) * 1.16,
              Math.cos((i / 12) * Math.PI * 2) * 1.16,
              0.07,
            ]}
            scale={[0.08, 0.2, 0.02]} />
        ))}
        <group ref={hr}>
          <mesh geometry={G.box} material={mat("#4A3F55")} position={[0, 0.34, 0.09]}
            scale={[0.1, 0.68, 0.03]} />
        </group>
        <group ref={min}>
          <mesh geometry={G.box} material={mat("#4A3F55")} position={[0, 0.48, 0.1]}
            scale={[0.07, 0.96, 0.03]} />
        </group>
      </group>
    </Site>
  );
}

/* ------------------------------------------------------------------ */

export function ProjectKingdom() {
  const R = def.radius;
  const dust = useRef<PuffHandle>(null);
  const acc = useRef(0);

  useFrame((_, dt) => {
    acc.current += dt;
    // Construction dust drifting off the CONVEX site.
    while (acc.current > 0.5) {
      acc.current -= 0.5;
      dust.current?.spawn(13 + (Math.random() - 0.5) * 5, 1.4, -13 + (Math.random() - 0.5) * 5, {
        scale: 1.5,
        life: 3.2,
        vy: 0.7,
        spread: 1.2,
      });
    }
  });

  const byId = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])) as Record<string, Project>,
    []
  );

  return (
    <Island def={def}>
      <GrassField radius={R - 1.5} count={780} color="#6FC47C" seed={21} exclude={6} />
      <Flowers radius={R - 3} count={90} seed={22} exclude={7} />

      {/* plaza + radial paths to each site */}
      <mesh geometry={G.cyl} material={mat("#C9B99A", { roughness: 0.94 })} position={[0, 0.05, 6]}
        scale={[7.5, 0.08, 7.5]} receiveShadow />
      {Object.values(SITES).map((s, i) => {
        const a = Math.atan2(s.pos[2] - 6, s.pos[0]);
        const len = Math.hypot(s.pos[0], s.pos[2] - 6);
        return (
          <mesh key={i} geometry={G.box} material={mat("#C9B99A", { roughness: 0.94 })}
            position={[(Math.cos(a) * len) / 2, 0.05, 6 + (Math.sin(a) * len) / 2]}
            rotation={[0, -a, 0]} scale={[len, 0.07, 2.4]} receiveShadow />
        );
      })}

      <IndeDdsLab project={byId.indedds} />
      <ConvexSite project={byId.convex} />
      <SwoosWarehouse project={byId.swoos} />
      <NeramOffice project={byId.neram} />

      {/* a ring of trees to give the kingdom an edge — one draw call per kind */}
      <Trees
        items={Array.from({ length: 18 }, (_, i) => {
          const a = (i / 18) * Math.PI * 2 + 0.2;
          const r = R - 2.6;
          return {
            position: [Math.cos(a) * r, 0, Math.sin(a) * r] as [number, number, number],
            scale: 0.8 + hash(i * 3.3) * 0.6,
            kind: (hash(i * 5.5) > 0.6 ? "pine" : "round") as TreeKind,
          };
        })}
      />

      <Waterfall position={[0, -0.6, R - 0.8]} width={4} height={18} />
      <Puffs ref={dust} count={90} color="#D8CDBA" gravity={0.6} growth={4} opacity={0.24} size={18} />
      <Motes count={60} area={[R * 1.6, 8, R * 1.6]} color="#FFE9B8" size={4} speed={0.5}
        opacity={0.4} />
    </Island>
  );
}
