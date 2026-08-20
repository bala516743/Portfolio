"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { G, PALETTE, glass, mat, mergeParts } from "../shared";
import { Island } from "../world/Island";
import { Motes } from "../effects/Motes";
import { Puffs, type PuffHandle } from "../effects/Puffs";
import { ISLAND_MAP } from "@/data/world";
import { achievements, type Achievement } from "@/data/resume";
import { useGame } from "@/lib/store";
import { sfx } from "@/lib/audio";
import { Spring } from "@/lib/math";
import { lampLevel } from "../world/daylight";

/**
 * Achievement Museum — one framed certificate per achievement.
 *
 * Four exhibits: a published research paper and three certifications. Each
 * sits in a brass-edged case under its own spotlight; clicking lifts the
 * glass, rotates the piece into view and throws confetti.
 */

const def = ISLAND_MAP.museum;

/**
 * A single museum spotlight, shared by every case.
 *
 * One spotlight per case is four more dynamic lights the whole world pays
 * for, to light one plinth at a time. Instead each case *claims* the light
 * when it is hovered or open, and the light glides over. Cases write their
 * bid here every frame; the light reads the winner. The per-frame stamp
 * resets the contest so a case that stops being active stops winning.
 */
const focus = { x: 0, z: 0, level: 0, stamp: -1 };

function claimSpot(stamp: number, x: number, z: number, level: number) {
  if (focus.stamp !== stamp) {
    focus.stamp = stamp;
    focus.level = 0;
  }
  if (level > focus.level) {
    focus.level = level;
    focus.x = x;
    focus.z = z;
  }
}

function MuseumSpot() {
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);

  useFrame((_, dt) => {
    const l = light.current;
    const tg = target.current;
    if (!l || !tg) return;
    // Bound imperatively: `target` as a JSX prop is undefined on first render
    // and assigning a ref later never re-renders, so the light would keep
    // aiming at its default origin object forever.
    if (l.target !== tg) l.target = tg;

    const k = 1 - Math.exp(-4 * dt);
    tg.position.x += (focus.x - tg.position.x) * k;
    tg.position.z += (focus.z - tg.position.z) * k;
    l.position.x = tg.position.x;
    l.position.z = tg.position.z + 0.6;
    l.intensity += (focus.level * 46 + lampLevel() * 8 - l.intensity) * k;
  });

  return (
    <>
      <object3D ref={target} position={[0, 0.9, 0]} />
      <spotLight
        ref={light}
        position={[0, 6.4, 0.6]}
        angle={0.4}
        penumbra={0.8}
        intensity={0}
        color="#FFE3A0"
        distance={14}
        decay={2}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The framed piece inside each case                                   */
/* ------------------------------------------------------------------ */

function Certificate({ icon, accent }: { icon: Achievement["icon"]; accent: string }) {
  const brass = mat("#C9A227", { roughness: 0.28, metalness: 0.8 });
  const paper = mat(PALETTE.paper, { roughness: 0.92 });
  const ink = mat("#8A7B6B", { roughness: 0.9 });

  return (
    <group>
      {/* easel foot */}
      <mesh geometry={G.cyl} material={brass} position={[0, 0.06, 0]} scale={[0.34, 0.12, 0.34]} />
      <mesh geometry={G.cylLo} material={brass} position={[0, 0.28, -0.06]} rotation={[0.22, 0, 0]}
        scale={[0.04, 0.44, 0.04]} />

      {/* frame + mount */}
      <group position={[0, 0.78, 0]} rotation={[-0.12, 0, 0]}>
        <mesh geometry={G.box} material={brass} scale={[1.02, 0.78, 0.05]} castShadow />
        <mesh geometry={G.box} material={paper} position={[0, 0, 0.035]} scale={[0.88, 0.64, 0.02]} />

        {/* a seal, ribbon and a few ruled lines — reads as a certificate
            without pretending to be legible text at this scale */}
        <mesh geometry={G.cyl} material={mat(accent, { roughness: 0.35, metalness: 0.4 })}
          position={[-0.28, -0.17, 0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[0.075, 0.02, 0.075]} />
        <mesh geometry={G.box} material={mat("#C0392B", { roughness: 0.7 })}
          position={[-0.28, -0.25, 0.05]} scale={[0.05, 0.12, 0.01]} />
        {[0.16, 0.06, -0.04].map((y, i) => (
          <mesh key={y} geometry={G.box} material={ink} position={[0.02, y, 0.05]}
            scale={[0.5 - i * 0.1, 0.022, 0.01]} />
        ))}
        <mesh geometry={G.box} material={mat(accent, { roughness: 0.5 })} position={[0, 0.26, 0.05]}
          scale={[0.34, 0.05, 0.01]} />

        {/* a published paper gets a second sheet peeking out behind it */}
        {icon === "paper" && (
          <mesh geometry={G.box} material={paper} position={[0.06, -0.03, -0.03]}
            rotation={[0, 0, 0.06]} scale={[0.86, 0.62, 0.015]} />
        )}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* A display case                                                      */
/* ------------------------------------------------------------------ */

function Case({ item, position }: { item: Achievement; position: [number, number, number] }) {
  const openAchievement = useGame((s) => s.openAchievement);
  const setOpenAchievement = useGame((s) => s.setOpenAchievement);
  const openPanel = useGame((s) => s.openPanel);
  const current = useGame((s) => s.current);
  const muted = useGame((s) => s.muted);
  const say = useGame((s) => s.say);

  const open = openAchievement === item.id;
  const parked = current === "museum";

  const lid = useRef<THREE.Group>(null);
  const piece = useRef<THREE.Group>(null);
  const hovered = useRef(false);
  // Placards appear when you approach a case, the way they do in a museum.
  const [showTag, setShowTag] = useState(false);
  const spring = useMemo(() => new Spring(0, 5.5, 0.55), []);
  const confetti = useRef<PuffHandle>(null);
  const celebrated = useRef(false);

  useFrame(({ clock }, dt) => {
    const active = open || (hovered.current && parked);
    const v = spring.step(active ? 1 : 0, dt);

    // The glass rises and tilts — a case being opened, not a box vanishing.
    if (lid.current) {
      lid.current.position.y = 1.35 + v * 1.15;
      lid.current.rotation.x = -v * 0.16;
    }
    if (piece.current) {
      piece.current.rotation.y += dt * (0.3 + v * 1.3);
      piece.current.position.y = 0.9 + v * 0.26 + Math.sin(clock.elapsedTime * 1.4) * 0.02;
      piece.current.scale.setScalar(1 + v * 0.14);
    }
    // Bid for the shared spotlight. Highest bidder this frame gets it.
    claimSpot(clock.elapsedTime, position[0], position[2], 0.28 + v * 0.72);

    if (open && !celebrated.current) {
      celebrated.current = true;
      confetti.current?.burst(position[0], position[1] + 2.2, position[2], 26, {
        scale: 0.5,
        life: 1.8,
        speed: 2.4,
        up: 1.4,
      });
      if (!muted) sfx("chime");
    }
    if (!open) celebrated.current = false;
  });

  return (
    <group position={position}>
      {/* plinth */}
      <mesh geometry={G.box} material={mat("#E8DCC0", { roughness: 0.6 })} position={[0, 0.42, 0]}
        scale={[1.9, 0.84, 1.9]} castShadow receiveShadow />
      <mesh geometry={G.box} material={mat("#C9A227", { roughness: 0.32, metalness: 0.7 })}
        position={[0, 0.87, 0]} scale={[2.05, 0.08, 2.05]} />

      <group ref={piece} position={[0, 0.9, 0]}>
        <Certificate icon={item.icon} accent={item.accent} />
      </group>

      {/* the glass */}
      <group ref={lid} position={[0, 1.35, 0]}>
        <mesh geometry={G.box} material={glass("#E8F6FF", 0.16)} scale={[1.7, 1.5, 1.7]} />
        {([[0, 0.76, 0.86], [0, -0.76, 0.86], [0, 0.76, -0.86], [0, -0.76, -0.86]] as const).map(
          ([x, y, z], i) => (
            <mesh key={i} geometry={G.box} material={mat("#C9A227", { roughness: 0.3, metalness: 0.8 })}
              position={[x, y, z]} scale={[1.74, 0.06, 0.06]} />
          )
        )}
        {([-0.86, 0.86] as const).map((x) => (
          <mesh key={x} geometry={G.box} material={mat("#C9A227", { roughness: 0.3, metalness: 0.8 })}
            position={[x, 0, 0]} scale={[0.06, 1.54, 0.06]} />
        ))}
      </group>

      {/* label plate */}
      <mesh geometry={G.box} material={mat("#C9A227", { roughness: 0.3, metalness: 0.75 })}
        position={[0, 0.62, 0.98]} rotation={[-0.35, 0, 0]} scale={[1.3, 0.34, 0.04]} />

      <mesh
        position={[0, 1.4, 0]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          if (!parked) return;
          setOpenAchievement(open ? null : item.id);
          openPanel();
          if (!open) say(`${item.title} — ${item.issuer}`, "reward");
          if (!muted) sfx("click");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!parked) return;
          hovered.current = true;
          setShowTag(true);
          document.body.style.cursor = "pointer";
          if (!muted) sfx("hover");
        }}
        onPointerOut={() => {
          hovered.current = false;
          setShowTag(false);
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[2.6, 3.4, 2.6]} />
      </mesh>

      {(showTag || open) && (
        <Html center distanceFactor={19} position={[0, 3.0, 0]} zIndexRange={[16, 0]}
          className="pointer-events-none">
          <span className="exhibit-tag" data-open={open}>
            <strong>{item.badge}</strong>
            <em>{item.title}</em>
          </span>
        </Html>
      )}

      <Puffs ref={confetti} count={40} color="#FFD277" gravity={-2.4} growth={0.8} opacity={0.95}
        size={8} additive />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The building                                                        */
/* ------------------------------------------------------------------ */

/**
 * The colonnade: twelve columns, each a base, a shaft and a capital.
 * Baked into one geometry and instanced — thirty-six draw calls became one.
 */
const COLUMN = mergeParts([
  { geo: G.cyl, color: "#D9CBB0", position: [0, 1.9, 0], scale: [0.62, 0.2, 0.62] },
  { geo: G.cyl, color: "#F0E6D2", position: [0, 4.2, 0], scale: [0.5, 4.4, 0.5] },
  { geo: G.cyl, color: "#D9CBB0", position: [0, 6.5, 0], scale: [0.68, 0.28, 0.68] },
]);

function Colonnade() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => mat("#FFFFFF", { roughness: 0.86, vertexColors: true }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * 7, 0, Math.sin(a) * 7);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [dummy]);

  return <instancedMesh ref={ref} args={[COLUMN, material, 12]} castShadow receiveShadow />;
}

function Rotunda() {
  const banner = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (banner.current) {
      banner.current.children.forEach((c, i) => {
        c.rotation.x = Math.sin(clock.elapsedTime * 1.1 + i) * 0.09;
      });
    }
  });

  const stone = mat("#F0E6D2", { roughness: 0.85 });
  const stoneDark = mat("#D9CBB0", { roughness: 0.88 });

  return (
    <group position={[0, 0, -7]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={G.cyl} material={stoneDark}
          position={[0, 0.12 + i * 0.24, 4.5 - i * 0.4]} scale={[7.5 - i * 0.5, 0.24, 7.5 - i * 0.5]}
          receiveShadow />
      ))}
      <mesh geometry={G.cyl} material={stone} position={[0, 0.9, 0]} scale={[8, 1.8, 8]}
        castShadow receiveShadow />
      <Colonnade />
      <mesh geometry={G.cyl} material={stone} position={[0, 7, 0]} scale={[8, 0.7, 8]} castShadow />
      <mesh geometry={G.cyl} material={stoneDark} position={[0, 7.5, 0]} scale={[7.2, 0.4, 7.2]} />
      <mesh material={mat("#C9A227", { roughness: 0.35, metalness: 0.7 })} position={[0, 7.6, 0]}
        castShadow>
        <sphereGeometry args={[6.2, 26, 14, 0, Math.PI * 2, 0, Math.PI / 2.2]} />
      </mesh>
      <mesh geometry={G.sphere}
        material={mat("#FFE9A8", { roughness: 0.2, metalness: 0.6, emissive: "#FFD277", emissiveIntensity: 1.2 })}
        position={[0, 12.4, 0]} scale={0.45} />

      {/* red carpet down the steps */}
      <mesh geometry={G.box} material={mat("#A8322C", { roughness: 0.95 })} position={[0, 0.78, 6]}
        scale={[3, 0.06, 8]} receiveShadow />
      {[-1.55, 1.55].map((x) => (
        <mesh key={x} geometry={G.box} material={mat("#C9A227", { roughness: 0.4, metalness: 0.6 })}
          position={[x, 0.79, 6]} scale={[0.12, 0.05, 8]} />
      ))}

      <group ref={banner}>
        {[-4, 0, 4].map((x) => (
          <mesh key={x} geometry={G.box} material={mat("#8E2C36", { roughness: 0.92 })}
            position={[x, 5.1, 7.6]} scale={[1.3, 3.4, 0.05]} castShadow />
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function AchievementMuseum() {
  const R = def.radius;

  // Four cases in a shallow arc around the rotunda, facing the pad.
  const spots = useMemo(
    () =>
      achievements.map((a, i) => {
        const t = achievements.length === 1 ? 0.5 : i / (achievements.length - 1);
        const angle = -0.35 + t * (Math.PI + 0.7);
        const r = 11.2;
        return { a, pos: [Math.cos(angle) * r, 0, Math.sin(angle) * r - 2] as [number, number, number] };
      }),
    []
  );

  return (
    <Island def={def}>
      <mesh geometry={G.cyl} material={mat("#E4D8BE", { roughness: 0.45 })} position={[0, 0.04, 0]}
        scale={[R - 1.2, 0.08, R - 1.2]} receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
        <ringGeometry args={[R - 4.5, R - 4.1, 60]} />
        <meshStandardMaterial color="#C9A227" roughness={0.35} metalness={0.7} />
      </mesh>

      <Rotunda />
      <MuseumSpot />
      {spots.map(({ a, pos }) => (
        <Case key={a.id} item={a} position={pos} />
      ))}

      {/* the warm wash that makes the whole island read as gold */}
      <pointLight position={[0, 6, -7]} color="#FFCF7A" intensity={26} distance={34} decay={2} />
      <pointLight position={[0, 3, 6]} color="#FFE3A0" intensity={14} distance={26} decay={2} />

      <Motes count={110} area={[R * 1.7, 10, R * 1.7]} color="#FFD277" size={5} speed={0.32}
        opacity={0.55} />
    </Island>
  );
}
