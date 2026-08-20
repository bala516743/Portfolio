"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import { G, PALETTE, glass, mat } from "../shared";
import { Island } from "../world/Island";
import { Puffs, type PuffHandle } from "../effects/Puffs";
import { Motes } from "../effects/Motes";
import { Trees, GrassField, type TreeKind } from "../props/Nature";
import { ISLAND_MAP } from "@/data/world";
import { skillCategories, skills, type SkillCategory } from "@/data/resume";
import { useGame } from "@/lib/store";
import { sfx } from "@/lib/audio";
import { Spring, hash } from "@/lib/math";
import { lampLevel } from "../world/daylight";

/**
 * Skills Lab — a technology park, not a list.
 *
 * Four districts, one per category, each its own building with its own
 * silhouette. Every skill in a district is a lit module on that building's
 * facade, and each one animates on its own clock. Nothing here references a
 * project by name: capability lives on this island, shipped work lives in
 * Project Kingdom, and mixing the two was what made the old version confusing.
 */

const def = ISLAND_MAP.skills;

type District = {
  cat: SkillCategory;
  pos: [number, number, number];
  rot: number;
};

const DISTRICTS: District[] = [
  { cat: "frontend", pos: [-11, 0, -9], rot: 0.6 },
  { cat: "backend", pos: [11.5, 0, -8.5], rot: -0.55 },
  { cat: "database", pos: [13, 0, 6], rot: -1.15 },
  { cat: "tools", pos: [-12.5, 0, 6.5], rot: 1.1 },
];

/* ------------------------------------------------------------------ */
/* A skill module — one lit panel on a building facade                 */
/* ------------------------------------------------------------------ */

function Module({
  id,
  name,
  color,
  position,
  seed,
  parked,
}: {
  id: string;
  name: string;
  color: string;
  position: [number, number, number];
  seed: number;
  parked: boolean;
}) {
  const active = useGame((s) => s.activeSkill) === id;
  const setActiveSkill = useGame((s) => s.setActiveSkill);
  const openPanel = useGame((s) => s.openPanel);
  const muted = useGame((s) => s.muted);

  const [hover, setHover] = useState(false);
  const face = useRef<THREE.MeshStandardMaterial>(null);
  const bar = useRef<THREE.Mesh>(null);
  const power = useMemo(() => new Spring(0, 8, 0.5), []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const p = power.step(active ? 1 : hover ? 0.45 : 0, dt);
    if (face.current) {
      // Idle shimmer, so even an unselected module is alive.
      const idle = 0.5 + Math.sin(t * 1.6 + seed * 8) * 0.18;
      face.current.emissiveIntensity = idle + p * 3.4 + lampLevel() * 0.8;
    }
    if (bar.current) {
      // A little activity read-out that fills and drains.
      const fill = 0.25 + (Math.sin(t * (0.7 + seed) + seed * 5) * 0.5 + 0.5) * (0.35 + p * 0.6);
      bar.current.scale.x = fill;
      bar.current.position.x = -0.36 + fill * 0.36;
    }
  });

  return (
    <group position={position}>
      <mesh
        geometry={G.box}
        scale={[0.92, 0.5, 0.1]}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          if (!parked) return;
          setActiveSkill(active ? null : id);
          openPanel();
          if (!muted) sfx(active ? "click" : "power");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!parked) return;
          setHover(true);
          document.body.style.cursor = "pointer";
          if (!muted) sfx("hover");
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <meshStandardMaterial
          ref={face}
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          roughness={0.35}
          metalness={0.15}
        />
      </mesh>
      {/* activity bar along the bottom edge */}
      <mesh ref={bar} geometry={G.box} material={mat("#FFFFFF", { emissive: "#FFFFFF", emissiveIntensity: 1.4 })}
        position={[0, -0.19, 0.06]} scale={[0.5, 0.05, 0.03]} />
      {/* bezel */}
      <mesh geometry={G.box} material={mat("#39404E", { roughness: 0.5, metalness: 0.4 })}
        position={[0, 0, -0.03]} scale={[1.02, 0.6, 0.06]} />

      {(hover || active) && (
        <Html center distanceFactor={16} position={[0, 0.5, 0.2]} zIndexRange={[18, 0]}
          className="pointer-events-none">
          <span className="machine-tag" data-active={active} style={{ ["--c" as string]: color }}>
            {name}
          </span>
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* District buildings — one silhouette per category                    */
/* ------------------------------------------------------------------ */

function Antenna({ height = 3 }: { height?: number }) {
  const ref = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = (clock.elapsedTime * 0.7) % 1;
      ref.current.emissiveIntensity = 1 + (t < 0.12 ? 5 : 0.2);
    }
  });
  return (
    <group>
      <mesh geometry={G.cylLo} material={mat("#8E99AB", { metalness: 0.5, roughness: 0.35 })}
        position={[0, height / 2, 0]} scale={[0.06, height, 0.06]} />
      <mesh geometry={G.sphereLo} position={[0, height, 0]} scale={0.11}>
        <meshStandardMaterial ref={ref} color="#FF6B6B" emissive="#FF4D4D" emissiveIntensity={1} />
      </mesh>
    </group>
  );
}

function DistrictBuilding({ district }: { district: District }) {
  const cat = skillCategories.find((c) => c.id === district.cat)!;
  const list = useMemo(() => skills.filter((s) => s.category === district.cat), [district.cat]);
  const current = useGame((s) => s.current);
  const activeCategory = useGame((s) => s.activeCategory);
  const setActiveCategory = useGame((s) => s.setActiveCategory);
  const openPanel = useGame((s) => s.openPanel);
  const muted = useGame((s) => s.muted);
  const parked = current === "skills";
  const open = activeCategory === cat.id;

  const glowRef = useRef<THREE.MeshStandardMaterial>(null);
  const spin = useRef<THREE.Group>(null);

  // Modules are laid out on the front face in a grid that grows with count.
  const cols = list.length > 6 ? 3 : 2;
  const rows = Math.ceil(list.length / cols);
  const W = cols * 1.25 + 1.4;
  const H = rows * 0.95 + 2.6;

  useFrame(({ clock }, dt) => {
    if (glowRef.current) {
      glowRef.current.emissiveIntensity =
        0.4 + (open ? 2.4 : 0.6) + Math.sin(clock.elapsedTime * 2) * 0.2 + lampLevel();
    }
    if (spin.current) spin.current.rotation.y += dt * 0.55;
  });

  return (
    <group position={district.pos} rotation={[0, district.rot, 0]}>
      {/* plot */}
      <mesh geometry={G.cyl} material={mat("#8E96A4", { roughness: 0.9 })} position={[0, 0.05, 0]}
        scale={[W * 0.85, 0.1, W * 0.85]} receiveShadow />

      {/* body */}
      <mesh geometry={G.box} material={mat("#E4E9F0", { roughness: 0.62 })} position={[0, H / 2, 0]}
        scale={[W, H, W * 0.7]} castShadow receiveShadow />
      {/* coloured plinth + cornice, so each district reads at a glance */}
      <mesh geometry={G.box} material={mat(cat.accent, { roughness: 0.5 })} position={[0, 0.35, 0]}
        scale={[W + 0.35, 0.7, W * 0.7 + 0.35]} castShadow />
      <mesh geometry={G.box} material={mat(cat.accent, { roughness: 0.5 })} position={[0, H + 0.2, 0]}
        scale={[W + 0.5, 0.4, W * 0.7 + 0.5]} castShadow />

      {/* roof kit varies per district so the four are distinguishable at range */}
      {district.cat === "frontend" && (
        <>
          <mesh geometry={G.box} material={glass("#CFE4FF", 0.4)} position={[0, H + 1.2, 0]}
            scale={[W * 0.7, 1.6, W * 0.5]} />
          <Antenna height={3.4} />
          <group position={[0, H + 2.6, 0]}>
            <Antenna height={2.2} />
          </group>
        </>
      )}
      {district.cat === "backend" && (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={G.cyl} material={mat("#9AA6B6", { roughness: 0.55, metalness: 0.3 })}
              position={[s * W * 0.28, H + 1.3, 0]} scale={[0.55, 2.6, 0.55]} castShadow />
          ))}
          <group ref={spin} position={[0, H + 3, 0]}>
            <mesh geometry={G.torus} material={mat(cat.accent, { roughness: 0.4, metalness: 0.4 })}
              rotation={[Math.PI / 2, 0, 0]} scale={[1.1, 1.1, 0.12]} />
          </group>
        </>
      )}
      {district.cat === "database" && (
        <>
          {/* stacked discs — the universal shorthand for a database */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={G.cyl} material={mat(i % 2 ? "#DDE6EF" : cat.accent, { roughness: 0.5 })}
              position={[0, H + 0.55 + i * 0.62, 0]} scale={[W * 0.34, 0.3, W * 0.34]} castShadow />
          ))}
          <Antenna height={2.4} />
        </>
      )}
      {district.cat === "tools" && (
        <>
          <mesh geometry={G.cone} material={mat(cat.accent, { roughness: 0.6 })}
            position={[0, H + 1.2, 0]} rotation={[0, Math.PI / 4, 0]} scale={[W * 0.72, 1.8, W * 0.52]}
            castShadow />
          <mesh geometry={G.cyl} material={mat("#9A8A78", { roughness: 0.8 })}
            position={[W * 0.3, H + 2, -W * 0.2]} scale={[0.3, 1.8, 0.3]} castShadow />
        </>
      )}

      {/* the modules themselves, on the front face */}
      {list.map((s, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = (c - (cols - 1) / 2) * 1.25;
        const y = H - 1.1 - r * 0.95;
        return (
          <Module
            key={s.id}
            id={s.id}
            name={s.name}
            color={s.color}
            position={[x, y, (W * 0.7) / 2 + 0.06]}
            seed={hash(i * 3.7 + district.pos[0])}
            parked={parked}
          />
        );
      })}

      {/* door + sign */}
      <mesh geometry={G.box} material={mat("#2B3140", { roughness: 1 })}
        position={[0, 0.95, (W * 0.7) / 2 + 0.02]} scale={[1.5, 1.9, 0.12]} />
      <mesh geometry={G.box} position={[0, 2.1, (W * 0.7) / 2 + 0.08]} scale={[W * 0.8, 0.34, 0.08]}>
        <meshStandardMaterial ref={glowRef} color={cat.accent} emissive={cat.accent}
          emissiveIntensity={0.6} roughness={0.4} />
      </mesh>

      {/* generous hit volume for opening the district */}
      <mesh
        position={[0, H / 2, 0]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          if (!parked) return;
          setActiveCategory(open ? null : cat.id);
          openPanel();
          if (!muted) sfx(open ? "click" : "unfold");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!parked) return;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[W + 2.4, H + 2, W * 0.7 + 2.4]} />
      </mesh>

      <Html center distanceFactor={30} position={[0, H + 3.9, 0]} zIndexRange={[16, 0]}
        className="pointer-events-none">
        <span className="district-tag" data-open={open} style={{ ["--c" as string]: cat.accent }}>
          <strong>
            {cat.glyph} {cat.label}
          </strong>
          <em>
            {list.length} {list.length === 1 ? "skill" : "skills"}
          </em>
        </span>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Park dressing                                                       */
/* ------------------------------------------------------------------ */

function Fountain() {
  const spray = useRef<PuffHandle>(null);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    while (acc.current > 0.09) {
      acc.current -= 0.09;
      spray.current?.spawn(0, 1.5, 0, { scale: 0.5, life: 1.4, vy: 2.6, spread: 0.28 });
    }
  });
  return (
    <group position={[0, 0, -1]}>
      <mesh geometry={G.cyl} material={mat("#C9D2DE", { roughness: 0.6 })} position={[0, 0.22, 0]}
        scale={[2.6, 0.44, 2.6]} castShadow receiveShadow />
      <mesh geometry={G.cyl} material={mat("#6FC7E8", { roughness: 0.15, metalness: 0.1 })}
        position={[0, 0.46, 0]} scale={[2.25, 0.06, 2.25]} />
      <mesh geometry={G.cyl} material={mat("#C9D2DE", { roughness: 0.6 })} position={[0, 0.85, 0]}
        scale={[0.4, 0.9, 0.4]} castShadow />
      <mesh geometry={G.sphereLo} material={mat("#9AD8FF", { roughness: 0.2 })} position={[0, 1.4, 0]}
        scale={0.32} />
      <Puffs ref={spray} count={70} color="#DCF1FF" gravity={-3.2} growth={1.4} opacity={0.4} size={11} />
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function SkillsLab() {
  const R = def.radius;

  return (
    <Island def={def}>
      {/* lawn + paved plaza */}
      <GrassField radius={R - 1.6} count={480} color="#7FC98D" seed={41} exclude={5.5} />
      <mesh geometry={G.cyl} material={mat("#CBD3DE", { roughness: 0.85 })} position={[0, 0.05, 0]}
        scale={[8.5, 0.09, 8.5]} receiveShadow />

      {/* radial paths out to each district */}
      {DISTRICTS.map((d, i) => {
        const a = Math.atan2(d.pos[2], d.pos[0]);
        const len = Math.hypot(d.pos[0], d.pos[2]);
        return (
          <mesh key={i} geometry={G.box} material={mat("#CBD3DE", { roughness: 0.88 })}
            position={[(Math.cos(a) * len) / 2, 0.05, (Math.sin(a) * len) / 2]}
            rotation={[0, -a, 0]} scale={[len, 0.08, 2.2]} receiveShadow />
        );
      })}

      <Fountain />

      {DISTRICTS.map((d) => (
        <DistrictBuilding key={d.cat} district={d} />
      ))}

      {/* a few trees so it reads as a park rather than an industrial estate */}
      <Trees
        items={Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 + 0.4;
          const r = R - 3.2;
          return {
            position: [Math.cos(a) * r, 0, Math.sin(a) * r] as [number, number, number],
            scale: 0.7 + hash(i * 4.4) * 0.5,
            kind: (hash(i * 2.2) > 0.6 ? "pine" : "round") as TreeKind,
          };
        })}
      />

      <Motes count={70} area={[R * 1.6, 7, R * 1.6]} color="#BFE8FF" size={4} speed={0.5} opacity={0.45} />
    </Island>
  );
}
