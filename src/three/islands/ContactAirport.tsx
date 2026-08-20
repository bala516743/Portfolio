"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import { G, PALETTE, glass, mat, mergeParts } from "../shared";
import { Island } from "../world/Island";
import { GrassField, Flowers } from "../props/Nature";
import { Puffs, type PuffHandle } from "../effects/Puffs";
import { Motes } from "../effects/Motes";
import { ISLAND_MAP } from "@/data/world";
import { useGame } from "@/lib/store";
import { sfx } from "@/lib/audio";
import { Spring, clamp, easeInOutCubic, easeOutCubic, hash } from "@/lib/math";
import { lampLevel } from "../world/daylight";
import { flight } from "@/lib/flight";

/**
 * Contact Airport — and the stage for the finale.
 *
 * Sending a message is not a form submission here: the letter folds itself,
 * lifts off the mailbox, and flies out past the edge of the world. The
 * runway lights and fireworks live on this island too, because this is
 * where the journey ends.
 */

const def = ISLAND_MAP.contact;

/* ------------------------------------------------------------------ */
/* Runway                                                              */
/* ------------------------------------------------------------------ */

/**
 * The runway.
 *
 * Deck and all its painted markings are one merged geometry, and the
 * twenty-four sequenced edge lights are a single InstancedMesh whose colours
 * are rewritten each frame. Per-instance emissive is not a thing in three, so
 * the lights use a basic material — they are self-lit anyway, and nothing is
 * lost. Thirty-nine draw calls became two.
 */
const RUNWAY_DECK = mergeParts([
  { geo: G.box, color: "#4E5768", scale: [5, 0.06, 22] },
  ...Array.from({ length: 11 }, (_, i) => ({
    geo: G.box,
    color: "#FFF6E0",
    position: [0, 0.05, -9.5 + i * 1.9] as [number, number, number],
    scale: [0.24, 0.03, 1.1] as [number, number, number],
  })),
  ...[-1.6, -0.8, 0.8, 1.6].map((x) => ({
    geo: G.box,
    color: "#FFF6E0",
    position: [x, 0.05, -10.4] as [number, number, number],
    scale: [0.22, 0.03, 1.8] as [number, number, number],
  })),
]);

const LIGHT_COUNT = 24;

function Runway() {
  const phase = useGame((s) => s.phase);
  const complete = phase === "complete";
  const lights = useRef<THREE.InstancedMesh>(null);
  const deckMat = useMemo(() => mat("#FFFFFF", { roughness: 0.9, vertexColors: true }), []);
  const bulbMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#FFFFFF"), toneMapped: false }),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const m = lights.current;
    if (!m) return;
    for (let i = 0; i < LIGHT_COUNT; i++) {
      const side = i % 2 ? 1 : -1;
      const pair = Math.floor(i / 2);
      dummy.position.set(side * 2.7, 0.14, -10 + pair * 1.75);
      dummy.scale.setScalar(0.14);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.set("#FFD277"));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [dummy, col]);

  useFrame(({ clock }) => {
    const m = lights.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const lamp = lampLevel();
    for (let i = 0; i < LIGHT_COUNT; i++) {
      const pair = Math.floor(i / 2);
      // Sequenced runway lights; at mission complete they go to full.
      const p = ((t * 3 - pair * 0.4) % 6) / 6;
      const on = p < 0.16 ? 1 : 0.1;
      const k = 0.28 + lamp * 0.3 + on * (complete ? 0.72 : 0.4);
      if (i < 4) col.setRGB(0.36 * k, 1 * k, 0.56 * k);
      else col.setRGB(1 * k, 0.82 * k, 0.42 * k);
      m.setColorAt(i, col);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <group position={[0, 0.02, -3]} rotation={[0, def.padHeading, 0]}>
      <mesh geometry={RUNWAY_DECK} material={deckMat} receiveShadow />
      <instancedMesh ref={lights} args={[G.sphereLo, bulbMat, LIGHT_COUNT]} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Control tower                                                       */
/* ------------------------------------------------------------------ */

function ControlTower() {
  const radar = useRef<THREE.Group>(null);
  const beaconMat = useRef<THREE.MeshStandardMaterial>(null);
  const sweep = useRef<THREE.Mesh>(null);
  const windows = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }, dt) => {
    if (radar.current) radar.current.rotation.y += dt * 1.15;
    if (sweep.current) sweep.current.rotation.y += dt * 1.15;
    if (beaconMat.current) {
      const t = (clock.elapsedTime * 0.55) % 1;
      beaconMat.current.emissiveIntensity = 1 + (t < 0.1 ? 6 : 0.2) + lampLevel() * 2;
    }
    if (windows.current) windows.current.emissiveIntensity = 0.3 + lampLevel() * 3;
  });

  return (
    <group position={[-9, 0, 4]} rotation={[0, 0.6, 0]}>
      <mesh geometry={G.box} material={mat("#DDE4EC", { roughness: 0.7 })} position={[0, 0.3, 0]}
        scale={[3.4, 0.6, 3.4]} castShadow receiveShadow />
      <mesh geometry={G.taper} material={mat("#E8EEF5", { roughness: 0.72 })} position={[0, 3.2, 0]}
        scale={[1.15, 5.6, 1.15]} castShadow />
      {/* cab */}
      <mesh geometry={G.cyl} material={mat("#C6D0DC", { roughness: 0.6 })} position={[0, 6.2, 0]}
        scale={[2.1, 0.24, 2.1]} castShadow />
      <mesh geometry={G.cyl} position={[0, 6.9, 0]} scale={[1.95, 1.2, 1.95]} castShadow>
        <meshStandardMaterial ref={windows} color="#8FCDE8" emissive="#FFD79A" emissiveIntensity={0.3}
          roughness={0.15} metalness={0.1} transparent opacity={0.85} />
      </mesh>
      <mesh geometry={G.cone} material={mat("#5E6B80", { roughness: 0.6 })} position={[0, 7.9, 0]}
        scale={[2.3, 0.9, 2.3]} castShadow />

      {/* radar + its sweep cone */}
      <group ref={radar} position={[0, 8.6, 0]}>
        <mesh geometry={G.cylLo} material={mat("#8E99AB", { metalness: 0.5 })} scale={[0.1, 0.6, 0.1]} />
        <mesh material={mat("#F0F4F8", { roughness: 0.35, metalness: 0.2 })} position={[0, 0.5, 0]}
          rotation={[0.6, 0, 0]}>
          <sphereGeometry args={[0.85, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
        </mesh>
      </group>
      <mesh ref={sweep} position={[0, 6.9, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[13, 13, 0.4, 20, 1, true, 0, 0.5]} />
        <meshBasicMaterial color="#7FE3F0" transparent opacity={0.055} depthWrite={false}
          side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>

      <mesh geometry={G.sphereLo} position={[0, 9.4, 0]} scale={0.18}>
        <meshStandardMaterial ref={beaconMat} color="#FF6B6B" emissive="#FF4D4D" emissiveIntensity={1} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The mailbox and its letter                                          */
/* ------------------------------------------------------------------ */

function Mailbox() {
  const letterSent = useGame((s) => s.letterSent);
  const openPanel = useGame((s) => s.openPanel);
  const current = useGame((s) => s.current);
  const muted = useGame((s) => s.muted);

  const flag = useRef<THREE.Group>(null);
  const door = useRef<THREE.Group>(null);
  const letter = useRef<THREE.Group>(null);
  const trail = useRef<PuffHandle>(null);
  const t = useRef(0);
  const hovered = useRef(false);
  const bounce = useMemo(() => new Spring(0, 9, 0.42), []);
  const acc = useRef(0);

  const parked = current === "contact";

  useFrame((_, dt) => {
    const b = bounce.step(hovered.current && parked ? 1 : 0, dt);
    if (flag.current) flag.current.rotation.z = (letterSent ? -1.35 : -0.1) + b * 0.15;
    if (door.current) door.current.rotation.x = letterSent ? -clamp(t.current * 3, 0, 1) * 1.2 : 0;

    if (!letterSent) {
      t.current = 0;
      if (letter.current) letter.current.visible = false;
      return;
    }

    t.current += dt;
    const g = letter.current;
    if (!g) return;
    g.visible = true;

    const u = clamp(t.current / 7, 0, 1);

    if (u < 0.16) {
      // 1. It folds itself: flat sheet creases into a paper aeroplane.
      const f = easeOutCubic(u / 0.16);
      g.position.set(0, 1.5, 0.4);
      g.scale.set(1 - f * 0.35, 0.15 + f * 0.85, 0.15 + f * 0.85);
      g.rotation.set(-Math.PI / 2 + f * Math.PI / 2, f * Math.PI * 2, 0);
    } else if (u < 0.34) {
      // 2. Lifts and turns toward the aeroplane.
      const f = easeInOutCubic((u - 0.16) / 0.18);
      const to = flight.pos.clone().sub(new THREE.Vector3(def.position.x, def.position.y, def.position.z));
      g.position.set(
        THREE.MathUtils.lerp(0, to.x, f),
        THREE.MathUtils.lerp(1.5, to.y + 0.4, f) + Math.sin(f * Math.PI) * 1.6,
        THREE.MathUtils.lerp(0.4, to.z, f)
      );
      g.scale.setScalar(1);
      g.rotation.set(0, Math.atan2(to.x, to.z), Math.sin(f * Math.PI) * 0.5);
    } else {
      // 3. Away, out past the edge of the world.
      const f = easeInOutCubic((u - 0.34) / 0.66);
      const from = flight.pos.clone().sub(new THREE.Vector3(def.position.x, def.position.y, def.position.z));
      g.position.set(
        from.x - f * 90,
        from.y + f * 40 + Math.sin(f * Math.PI) * 6,
        from.z - f * 60
      );
      g.rotation.set(-0.2 - f * 0.3, -0.9, Math.sin(f * 7) * 0.25);
      g.scale.setScalar(clamp(1 - (f - 0.7) / 0.3, 0.001, 1));

      acc.current += dt;
      while (acc.current > 0.05 && f < 0.92) {
        acc.current -= 0.05;
        trail.current?.spawn(
          def.position.x + g.position.x,
          def.position.y + g.position.y,
          def.position.z + g.position.z,
          { scale: 0.5, life: 1.4, vy: 0.3, spread: 0.2 }
        );
      }
    }
  });

  return (
    <group position={[6.5, 0, 6]} rotation={[0, -0.7, 0]}>
      {/* post */}
      <mesh geometry={G.cylLo} material={mat(PALETTE.woodDark, { roughness: 0.88 })}
        position={[0, 0.6, 0]} scale={[0.12, 1.2, 0.12]} castShadow />
      {/* box */}
      <mesh geometry={G.box} material={mat("#4C9BD6", { roughness: 0.45 })} position={[0, 1.5, 0]}
        scale={[0.9, 0.7, 1.2]} castShadow />
      <mesh material={mat("#3D82B4", { roughness: 0.45 })} position={[0, 1.85, 0]}
        rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.45, 1.2, 14, 1, false, Math.PI / 2, Math.PI]} />
      </mesh>
      <group ref={door} position={[0, 1.5, 0.6]}>
        <mesh geometry={G.box} material={mat("#357099", { roughness: 0.45 })} position={[0, 0, 0.02]}
          scale={[0.86, 0.66, 0.05]} />
      </group>
      {/* flag */}
      <group ref={flag} position={[0.5, 1.8, -0.3]}>
        <mesh geometry={G.box} material={mat("#E8553F", { roughness: 0.5 })} position={[0, 0.3, 0]}
          scale={[0.06, 0.6, 0.06]} />
        <mesh geometry={G.box} material={mat("#E8553F", { roughness: 0.5 })} position={[0.14, 0.52, 0]}
          scale={[0.28, 0.22, 0.03]} />
      </group>

      {/* the letter */}
      <group ref={letter} visible={false}>
        <mesh material={mat("#FFFBF0", { roughness: 0.94, side: THREE.DoubleSide })}
          rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.2, 0.7, 3]} />
        </mesh>
        <mesh geometry={G.box} material={mat("#E8553F", { roughness: 0.8 })} position={[0, 0, 0.1]}
          scale={[0.06, 0.06, 0.06]} />
      </group>
      <Puffs ref={trail} count={80} color="#FFF3D6" gravity={0.4} growth={2} opacity={0.5} size={9} />

      <mesh
        position={[0, 1.5, 0]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          if (!parked) return;
          openPanel();
          if (!muted) sfx("click");
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
        <boxGeometry args={[2, 2.6, 2]} />
      </mesh>

      <Html center distanceFactor={17} position={[0, 2.7, 0]} zIndexRange={[16, 0]}
        className="pointer-events-none">
        <span className="exhibit-tag" data-open={letterSent}>
          <strong>{letterSent ? "Delivered" : "Outbound"}</strong>
          <em>Mailbox</em>
        </span>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Fireworks — finale only                                             */
/* ------------------------------------------------------------------ */

/** One shell per colour — a Puffs field carries a single colour uniform, so
 *  a multicoloured display means several fields fired in rotation. */
const FIREWORK_COLORS = ["#FFD277", "#FF6B8A", "#7FE3F0", "#9AE86B", "#C4A0FF"];

function Fireworks() {
  const phase = useGame((s) => s.phase);
  const muted = useGame((s) => s.muted);
  const shells = useRef<(PuffHandle | null)[]>([]);
  const timer = useRef(0);
  const next = useRef(0);

  useFrame((_, dt) => {
    if (phase !== "complete") return;
    timer.current -= dt;
    if (timer.current > 0) return;
    timer.current = 0.55 + Math.random() * 0.8;

    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 16;
    // Kept inside the finale camera's frame. At 14-30 the shells detonated
    // above the top edge and the display was invisible.
    const y = 7 + Math.random() * 11;
    // Step the colour rather than picking at random, so no two consecutive
    // shells are the same and the display reads as deliberate.
    const shell = shells.current[next.current % FIREWORK_COLORS.length];
    next.current++;
    shell?.burst(Math.cos(a) * r, y, Math.sin(a) * r, 48, {
      scale: 0.55,
      life: 2.2,
      speed: 7.5,
      up: 0.2,
    });
    if (!muted) sfx("firework");
  });

  return (
    <>
      {FIREWORK_COLORS.map((c, i) => (
        <Puffs
          key={c}
          ref={(h) => {
            shells.current[i] = h;
          }}
          count={130}
          color={c}
          gravity={-1.4}
          growth={0.5}
          opacity={0.95}
          size={7}
          additive
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */

export function ContactAirport() {
  const R = def.radius;

  return (
    <Island def={def}>
      <GrassField radius={R - 1.5} count={520} color="#7FCBB4" seed={31} exclude={5} />
      <Flowers radius={R - 3} count={60} seed={32} colors={["#FFFFFF", "#FFD166", "#9AD8FF"]}
        exclude={5.5} />

      <Runway />
      <ControlTower />
      <Mailbox />

      {/* small hangar */}
      <group position={[9.5, 0, -6]} rotation={[0, -0.9, 0]}>
        <mesh material={mat("#E4E9F0", { roughness: 0.6, metalness: 0.12 })} position={[0, 0, 0]}
          rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[2.4, 2.4, 5.4, 18, 1, false, Math.PI / 2, Math.PI]} />
        </mesh>
        <mesh geometry={G.box} material={mat("#2B3140", { roughness: 1 })} position={[0, 1.1, -2.5]}
          scale={[4.4, 2.2, 0.1]} />
      </group>

      {/* windsock */}
      <group position={[-4, 0, 9]}>
        <mesh geometry={G.cylLo} material={mat(PALETTE.steelDark, { metalness: 0.4 })}
          position={[0, 1.3, 0]} scale={[0.05, 2.6, 0.05]} castShadow />
        <WindsockCone />
      </group>

      {/* approach lights leading in from the edge */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} geometry={G.sphereLo} position={[0, 0.3, 12 + i * 1.6]} scale={0.13}>
          <meshStandardMaterial color="#7CFF9A" emissive="#5CFF8F" emissiveIntensity={2.4} />
        </mesh>
      ))}

      <Fireworks />
      <Motes count={70} area={[R * 1.6, 7, R * 1.6]} color="#BFE8FF" size={4} speed={0.4}
        opacity={0.45} />
    </Island>
  );
}

function WindsockCone() {
  const sock = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!sock.current) return;
    const t = clock.elapsedTime;
    sock.current.rotation.y = Math.sin(t * 0.45) * 0.6 - 0.3;
    sock.current.rotation.z = -0.95 - Math.sin(t * 1.9) * 0.16;
  });
  return (
    <group ref={sock} position={[0, 2.6, 0]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={G.cone} material={mat(i % 2 ? "#E8553F" : "#FFF3E0")}
          position={[0.24 + i * 0.36, 0, 0]} rotation={[0, 0, -Math.PI / 2]}
          scale={[0.27 - i * 0.043, 0.36, 0.27 - i * 0.043]} castShadow />
      ))}
    </group>
  );
}
