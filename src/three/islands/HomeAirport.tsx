"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { G, PALETTE, glass, mat, mergeParts } from "../shared";
import { windMaterial } from "../world/wind";
import { Island, shade } from "../world/Island";
import { Flowers, GrassField, Trees, Waterfall, type TreeKind } from "../props/Nature";
import { ISLAND_MAP } from "@/data/world";
import { lampLevel } from "../world/daylight";
import { Flock } from "../world/Flock";

/**
 * Home Airport — the hangar the toy came from.
 *
 * Deliberately the humblest island: a grass strip, a shed, a windsock and
 * a fence. It has to feel like somewhere you *leave*, so nothing here
 * competes with the destinations.
 */

const def = ISLAND_MAP.home;

function Windsock({ position }: { position: [number, number, number] }) {
  const sock = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!sock.current) return;
    const t = clock.elapsedTime;
    // Swings on the breeze and lifts when the "wind" picks up.
    sock.current.rotation.y = Math.sin(t * 0.5) * 0.5 + 0.4;
    sock.current.rotation.z = -0.9 - Math.sin(t * 1.7) * 0.18;
  });
  return (
    <group position={position}>
      <mesh geometry={G.cylLo} material={mat(PALETTE.steelDark, { metalness: 0.4, roughness: 0.4 })}
        position={[0, 1.5, 0]} scale={[0.06, 3, 0.06]} castShadow />
      <group ref={sock} position={[0, 3, 0]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} geometry={G.cone} material={mat(i % 2 ? "#E8553F" : "#FFF3E0")}
            position={[0.28 + i * 0.42, 0, 0]} rotation={[0, 0, -Math.PI / 2]}
            scale={[0.32 - i * 0.05, 0.42, 0.32 - i * 0.05]} castShadow />
        ))}
      </group>
      <mesh geometry={G.torus} material={mat("#FFC65C")} position={[0, 3, 0]}
        rotation={[0, Math.PI / 2, 0]} scale={[0.3, 0.3, 0.1]} />
    </group>
  );
}

function Hangar() {
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (beacon.current) {
      beacon.current.emissiveIntensity =
        1 + Math.max(0, Math.sin(clock.elapsedTime * 2.2)) * 4 + lampLevel() * 2;
    }
  });

  return (
    <group position={[-7.5, 0, -3]} rotation={[0, 0.5, 0]}>
      {/* Barrel roof. thetaStart = π/2 is load-bearing: with the cylinder
          laid on its side, the default 0..π half covers one vertical flank,
          which renders as a standing shell rather than an arch. π/2..3π/2 is
          the half that sits over the top. */}
      <mesh material={mat("#E4E9F0", { roughness: 0.6, metalness: 0.15 })} position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.1, 3.1, 7, 20, 1, false, Math.PI / 2, Math.PI]} />
      </mesh>
      {/* ribs, so the roof reads as corrugated sheet */}
      {[-2.6, -1.3, 0, 1.3, 2.6].map((z) => (
        <mesh key={z} material={mat("#C3CBD8", { roughness: 0.5, metalness: 0.2 })}
          position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3.16, 3.16, 0.12, 20, 1, false, Math.PI / 2, Math.PI]} />
        </mesh>
      ))}
      {/* back wall — the same arch, one slab thick */}
      <mesh material={mat("#D6DDE8", { roughness: 0.7 })} position={[0, 0, -3.5]}
        rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[3.05, 3.05, 0.16, 20, 1, false, Math.PI / 2, Math.PI]} />
      </mesh>
      {/* dark interior so the opening has depth */}
      <mesh geometry={G.box} material={mat("#2B3140", { roughness: 1 })} position={[0, 1.4, -3.2]}
        scale={[5.6, 2.8, 0.1]} />
      {/* apron */}
      <mesh geometry={G.cyl} material={mat("#8C939F", { roughness: 0.92 })} position={[0, 0.03, 2.4]}
        scale={[3.6, 0.06, 3.6]} receiveShadow />
      {/* rooftop beacon */}
      <mesh geometry={G.sphereLo} position={[0, 3.4, 0]} scale={0.22}>
        <meshStandardMaterial ref={beacon} color="#FF6B6B" emissive="#FF4D4D" emissiveIntensity={1} />
      </mesh>
      {/* fuel drums */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} geometry={G.cyl} material={mat(["#E8553F", "#4C9BD6", "#F2B441"][i], { roughness: 0.5 })}
          position={[3.9, 0.42, -1.4 + i * 0.95]} scale={[0.4, 0.85, 0.4]} castShadow />
      ))}
    </group>
  );
}

/** A grass runway with painted markings — the one you first lift off from. */
function Strip() {
  return (
    <group position={[4, 0.02, 2]} rotation={[0, -0.35, 0]}>
      <mesh geometry={G.box} material={mat("#C7B48E", { roughness: 0.95 })}
        position={[0, 0, 0]} scale={[4.4, 0.04, 15]} receiveShadow />
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} geometry={G.box} material={mat("#FFF6E0", { roughness: 0.8 })}
          position={[0, 0.03, -6.4 + i * 1.6]} scale={[0.26, 0.03, 0.9]} />
      ))}
      {/* threshold bars */}
      {[-1.4, -0.7, 0.7, 1.4].map((x) => (
        <mesh key={x} geometry={G.box} material={mat("#FFF6E0", { roughness: 0.8 })}
          position={[x, 0.03, -7.1]} scale={[0.2, 0.03, 1.6]} />
      ))}
    </group>
  );
}

/**
 * Perimeter fence.
 *
 * One post plus its two rails is baked into a single geometry and instanced
 * around the island: twenty-five sections used to be seventy-five draw calls
 * for a picket fence you fly straight past.
 */
const FENCE_SECTION = mergeParts([
  { geo: G.box, color: "#FFF6E8", position: [0, 0.45, 0], scale: [0.1, 0.9, 0.1] },
  { geo: G.box, color: "#FFF6E8", position: [0, 0.62, 1.5], scale: [0.06, 0.1, 3] },
  { geo: G.box, color: "#FFF6E8", position: [0, 0.3, 1.5], scale: [0.06, 0.1, 3] },
]);

function Fence({ radius }: { radius: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(
    () => mat("#FFFFFF", { roughness: 0.85, vertexColors: true }),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const sections = useMemo(() => {
    const posts = 34;
    const out: { a: number }[] = [];
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      // Leave a gap where the runway runs off the edge.
      if (a > 0.3 && a < 1.15) continue;
      out.push({ a });
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    sections.forEach(({ a }, i) => {
      dummy.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      dummy.rotation.set(0, -a, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.count = sections.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [sections, radius, dummy]);

  return (
    <instancedMesh ref={ref} args={[FENCE_SECTION, material, sections.length]} castShadow />
  );
}

export function HomeAirport() {
  const R = def.radius;
  return (
    <Island def={def}>
      <GrassField radius={R - 1.5} count={620} color="#6FC47C" seed={1} exclude={4.6} />
      <Flowers radius={R - 2.5} count={70} seed={2} exclude={5} />

      <Strip />
      <Hangar />
      <Windsock position={[8.5, 0, 6]} />
      <Fence radius={R - 0.9} />

      {/* a small welcome arch over the pad approach */}
      <group position={[0, 0, 9]}>
        {[-2.6, 2.6].map((x) => (
          <mesh key={x} geometry={G.cylLo} material={mat(PALETTE.wood, { roughness: 0.85 })}
            position={[x, 1.5, 0]} scale={[0.14, 3, 0.14]} castShadow />
        ))}
        <mesh geometry={G.box} material={mat(PALETTE.planeGold, { roughness: 0.6 })}
          position={[0, 3.1, 0]} scale={[6, 0.5, 0.24]} castShadow />
        <mesh geometry={G.box} material={mat(PALETTE.woodDark)} position={[0, 3.42, 0]}
          scale={[6.3, 0.16, 0.32]} />
      </group>

      {/* windmill-free, tree-light: this island stays quiet on purpose */}
      <Trees
        items={[
          { position: [-10, 0, 7], scale: 1.2, kind: "round" },
          { position: [-12.5, 0, 3.5], scale: 0.9, kind: "pine" },
          { position: [10.5, 0, -8], scale: 1.05, kind: "round" },
          { position: [6, 0, -11], scale: 0.85, kind: "pine" },
        ]}
      />

      <Waterfall position={[-2, -0.6, -R + 0.6]} width={3.2} height={16} />

      <Flock count={10} kind="butterfly" center={[0, 2, 6]} radius={7} vertical={1.4} speed={0.5}
        scale={0.7} color="#FFD166" colorB="#FF8FA3" />
    </Island>
  );
}
