"use client";

import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useGame } from "@/lib/store";
import { sfx, setRainAudio } from "@/lib/audio";
import { hash } from "@/lib/math";
import { dayMix } from "./daylight";
import { WORLD_CENTER } from "@/data/world";

/* ------------------------------------------------------------------ */
/* CLOUDS                                                              */
/* ------------------------------------------------------------------ */

const CLOUD_COUNT = 46;
const BLOBS_PER_CLOUD = 6;

type Cloud = { x: number; y: number; z: number; scale: number; drift: number; seed: number };

function makeClouds(): Cloud[] {
  return Array.from({ length: CLOUD_COUNT }, (_, i) => {
    const a = hash(i * 1.7) * Math.PI * 2;
    const r = 60 + hash(i * 3.1) * 230;
    return {
      x: WORLD_CENTER.x + Math.cos(a) * r,
      y: WORLD_CENTER.y - 34 + hash(i * 5.3) * 96,
      z: WORLD_CENTER.z + Math.sin(a) * r,
      scale: 4 + hash(i * 7.9) * 9,
      drift: 0.5 + hash(i * 11.3) * 1.4,
      seed: hash(i * 13.7),
    };
  });
}

/**
 * Clouds are one instanced mesh — 276 rounded blobs, one draw call.
 * Clicking any of them starts the rain, which is the easter egg most
 * people trip over by accident while trying to click an island.
 */
function Clouds() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const clouds = useMemo(makeClouds, []);
  const lowPower = useGame((s) => s.lowPower);
  const raining = useGame((s) => s.raining);
  const setRain = useGame((s) => s.setRain);
  const say = useGame((s) => s.say);
  const muted = useGame((s) => s.muted);

  const count = (lowPower ? Math.floor(CLOUD_COUNT * 0.55) : CLOUD_COUNT) * BLOBS_PER_CLOUD;

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#FFFFFF"),
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0.94,
        // Flat shading gives the faceted, papercraft look rather than a
        // photoreal puff; it is also one less normal interpolation.
        flatShading: true,
      }),
    []
  );

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    let i = 0;
    for (let c = 0; c < clouds.length && i < count; c++) {
      const cl = clouds[c];
      for (let b = 0; b < BLOBS_PER_CLOUD && i < count; b++, i++) {
        const s = hash(c * 31 + b * 7);
        const s2 = hash(c * 17 + b * 3);
        dummy.position.set(
          cl.x + (s - 0.5) * cl.scale * 2.4,
          cl.y + (s2 - 0.5) * cl.scale * 0.55,
          cl.z + (hash(c * 23 + b * 11) - 0.5) * cl.scale * 1.5
        );
        const bs = cl.scale * (0.5 + s2 * 0.6);
        dummy.scale.set(bs, bs * 0.72, bs * 0.9);
        dummy.rotation.set(s * 3, s2 * 3, 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      }
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [clouds, count, dummy]);

  useFrame(({ clock }) => {
    // Clouds tint with the sky rather than staying stubbornly white.
    const n = dayMix.night;
    material.color.setRGB(1 - n * 0.68, 1 - n * 0.64, 1 - n * 0.45);
    if (mesh.current) {
      // The whole layer drifts as one slab; per-cloud drift would mean
      // rewriting 276 matrices every frame for a difference nobody sees.
      mesh.current.position.x = Math.sin(clock.elapsedTime * 0.02) * 7;
      mesh.current.position.z = Math.cos(clock.elapsedTime * 0.017) * 5;
    }
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, count]}
      material={material}
      castShadow={false}
      receiveShadow={false}
      onClick={(e) => {
        e.stopPropagation();
        const next = !raining;
        setRain(next);
        setRainAudio(next);
        if (!muted) sfx("click");
        say(next ? "You squeezed a cloud. It is raining." : "Rain stopped. Skies clear.", "reward");
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* RAIN                                                                */
/* ------------------------------------------------------------------ */

const RAIN_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uSpread;
  varying float vFade;
  void main() {
    vec3 p = position;
    // Each drop falls on its own clock and wraps — no respawn bookkeeping.
    float fall = fract(aSeed + uTime * (0.42 + aSeed * 0.25));
    p.y = uHeight * (0.5 - fall);
    p.x += sin(aSeed * 40.0) * 1.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vFade = smoothstep(1.0, 0.75, fall) * smoothstep(0.0, 0.06, fall);
    gl_PointSize = (2.6 + aSeed * 2.0) * (70.0 / -mv.z);
  }
`;
const RAIN_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    // Stretched vertically into a streak, not a round dot.
    float d = length(vec2(c.x * 3.4, c.y));
    if (d > 0.5) discard;
    gl_FragColor = vec4(0.78, 0.88, 1.0, smoothstep(0.5, 0.0, d) * vFade * uOpacity);
    #include <colorspace_fragment>
  }
`;

function Rain() {
  const raining = useGame((s) => s.raining);
  const lowPower = useGame((s) => s.lowPower);
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const points = useRef<THREE.Points>(null);
  const count = lowPower ? 600 : 1800;
  const HEIGHT = 90;
  const SPREAD = 90;

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * SPREAD;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uHeight: { value: HEIGHT },
          uSpread: { value: SPREAD },
        },
      }),
    []
  );

  useFrame(({ clock }, dt) => {
    const u = material.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uOpacity.value += ((raining ? 0.75 : 0) - u.uOpacity.value) * (1 - Math.exp(-1.4 * dt));
    if (group.current) group.current.position.copy(camera.position);
    if (points.current) points.current.visible = u.uOpacity.value > 0.01;
  });

  return (
    <group ref={group}>
      <points ref={points} geometry={geom} material={material} frustumCulled={false} />
    </group>
  );
}

export function Weather() {
  return (
    <>
      <Clouds />
      <Rain />
    </>
  );
}
