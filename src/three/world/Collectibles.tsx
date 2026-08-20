"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Puffs, type PuffHandle } from "../effects/Puffs";
import { flight } from "@/lib/flight";
import { useGame } from "@/lib/store";
import { sfx } from "@/lib/audio";
import { developerFacts } from "@/data/resume";
import { ISLANDS } from "@/data/world";
import { hash } from "@/lib/math";

/**
 * Collectible stars.
 *
 * Ten of them, hung along the routes between islands rather than on them, so
 * they are found by flying rather than by hunting.
 *
 * This is one InstancedMesh, one frame callback and one shared particle pool
 * for all ten. The previous version was ten React components, each with its
 * own useFrame, its own Puffs system (own geometry + own shader + own draw
 * call) and — the expensive part — its own pointLight. Ten extra dynamic
 * lights meant every lit fragment in the world looped over ten more lights
 * for the entire session, and the hitch on pickup was the store update
 * re-rendering all ten subscribers at once. None of that is needed: the
 * stars are emissive and have a halo, so they read as glowing without
 * actually lighting anything.
 */

const STAR_GEO = (() => {
  const shape = new THREE.Shape();
  const outer = 1;
  const inner = 0.44;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelSize: 0.08,
    bevelThickness: 0.08,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.center();
  return g;
})();

const HALO_GEO = new THREE.SphereGeometry(1, 10, 7);

/** Spots between islands, biased toward the midpoint of each hop. */
const SPOTS: THREE.Vector3[] = (() => {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < ISLANDS.length; i++) {
    const a = ISLANDS[i].position;
    const b = ISLANDS[(i + 1) % ISLANDS.length].position;
    const t = 0.38 + hash(i * 7.3) * 0.24;
    const p = a.clone().lerp(b, t);
    p.y += 14 + hash(i * 3.1) * 12;
    p.x += (hash(i * 5.9) - 0.5) * 26;
    p.z += (hash(i * 9.7) - 0.5) * 26;
    out.push(p);
  }
  // Three extra, high above the archipelago, for people who go looking.
  out.push(new THREE.Vector3(60, 62, -80));
  out.push(new THREE.Vector3(150, 48, -170));
  out.push(new THREE.Vector3(-40, 54, -110));
  return out;
})();

export const STAR_TOTAL = SPOTS.length;

/** Squared pickup radius. Generous — a precision target at speed is a chore. */
const PICKUP_SQ = 46;

export function Collectibles() {
  const phase = useGame((s) => s.phase);
  const collect = useGame((s) => s.collectStar);
  const say = useGame((s) => s.say);
  const muted = useGame((s) => s.muted);

  const stars = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const burst = useRef<PuffHandle>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  /**
   * Collection state is tracked here, not in the store, so picking one up
   * costs zero React re-renders inside the render loop. The store is still
   * told — it drives the HUD counter — but nothing in this component waits
   * on that round trip.
   */
  const taken = useMemo(() => new Uint8Array(SPOTS.length), []);
  const shrink = useMemo(() => new Float32Array(SPOTS.length).fill(1), []);

  const starMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#FFD277"),
        emissive: new THREE.Color("#FFC65C"),
        emissiveIntensity: 1.6,
        roughness: 0.28,
        metalness: 0.5,
      }),
    []
  );

  const haloMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#FFD277"),
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  const active = phase === "flying" || phase === "landed";

  useFrame(({ clock }, dt) => {
    const sm = stars.current;
    const hm = halos.current;
    if (!sm || !hm || !active) return;
    const t = clock.elapsedTime;

    starMat.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.4;

    let anyMoving = false;

    for (let i = 0; i < SPOTS.length; i++) {
      const p = SPOTS[i];

      if (!taken[i]) {
        // One squared-distance test per star per frame. Ten of these is
        // nothing; it was never the collision check that cost anything.
        const dx = flight.pos.x - p.x;
        const dy = flight.pos.y - (p.y + Math.sin(t * 1.1 + i * 2) * 0.7);
        const dz = flight.pos.z - p.z;
        if (dx * dx + dy * dy + dz * dz < PICKUP_SQ && flight.mode !== "parked") {
          taken[i] = 1;
          burst.current?.burst(p.x, p.y, p.z, 24, {
            scale: 0.5,
            life: 1.2,
            speed: 4,
            up: 0.6,
          });
          if (!muted) sfx("star");
          collect(i);
          say(developerFacts[i % developerFacts.length], "reward");
        }
      }

      if (taken[i] && shrink[i] > 0) {
        shrink[i] = Math.max(0, shrink[i] - dt * 3.4);
        anyMoving = true;
      }

      const s = shrink[i];
      if (s <= 0) {
        // Collapse to zero scale rather than branching on visibility — an
        // instance with no size costs nothing to rasterise.
        dummy.position.copy(p);
        dummy.scale.setScalar(0);
        dummy.rotation.set(0, 0, 0);
      } else {
        dummy.position.set(p.x, p.y + Math.sin(t * 1.1 + i * 2) * 0.7, p.z);
        dummy.rotation.set(0, t * 1.1 + i, Math.sin(t * 1.3 + i) * 0.14);
        dummy.scale.setScalar(0.9 * s);
      }
      dummy.updateMatrix();
      sm.setMatrixAt(i, dummy.matrix);

      dummy.scale.setScalar(s <= 0 ? 0 : (2.2 + Math.sin(t * 2 + i) * 0.25) * s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      hm.setMatrixAt(i, dummy.matrix);
    }

    sm.instanceMatrix.needsUpdate = true;
    hm.instanceMatrix.needsUpdate = true;
    void anyMoving;
  });

  if (!active) return null;

  return (
    <>
      <instancedMesh ref={stars} args={[STAR_GEO, starMat, SPOTS.length]} frustumCulled={false} />
      <instancedMesh ref={halos} args={[HALO_GEO, haloMat, SPOTS.length]} frustumCulled={false} />
      {/* One pool shared by every star, rather than one pool each. */}
      <Puffs ref={burst} count={90} color="#FFE9A8" gravity={-1.2} growth={0.8} opacity={0.95}
        size={8} additive />
    </>
  );
}
