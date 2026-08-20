"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

/**
 * A GPU particle pool for every soft, round, fading thing in the world:
 * exhaust smoke, landing dust, takeoff cloud burst, factory steam,
 * waterfall spray, firework sparks.
 *
 * One buffer, one draw call, one shader. Particles are recycled from a ring
 * so there is zero allocation after mount — a garbage collection pause is a
 * dropped frame, and a dropped frame is the one thing we cannot have.
 */

export type PuffHandle = {
  spawn: (
    x: number,
    y: number,
    z: number,
    opts?: {
      scale?: number;
      life?: number;
      vx?: number;
      vy?: number;
      vz?: number;
      spread?: number;
    }
  ) => void;
  burst: (
    x: number,
    y: number,
    z: number,
    count: number,
    opts?: { scale?: number; life?: number; speed?: number; up?: number }
  ) => void;
};

type Props = {
  count?: number;
  color?: string;
  /** Positive drifts up (smoke), negative settles down (dust). */
  gravity?: number;
  /** How much each puff grows over its life. */
  growth?: number;
  opacity?: number;
  /** Additive reads as light (sparks, fireworks); normal reads as matter. */
  additive?: boolean;
  size?: number;
};

const VERT = /* glsl */ `
  attribute float aBirth;
  attribute float aLife;
  attribute float aScale;
  attribute vec3 aVel;
  attribute float aSeed;

  uniform float uTime;
  uniform float uGravity;
  uniform float uGrowth;
  uniform float uSize;
  uniform float uPixelRatio;

  varying float vAlpha;
  varying float vSeed;

  void main() {
    float age = uTime - aBirth;
    float t = age / aLife;

    if (t < 0.0 || t > 1.0) {
      // Park dead particles behind the camera and give them zero size.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    vec3 pos = position + aVel * age;
    pos.y += uGravity * age * age * 0.5;
    // Lazy curl so smoke doesn't rise in a straight column.
    pos.x += sin(uTime * 0.9 + aSeed * 6.283) * age * 0.35;
    pos.z += cos(uTime * 0.7 + aSeed * 6.283) * age * 0.35;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float grow = 1.0 + t * uGrowth;
    // Fade in fast, out slow — the shape of a real puff dissipating.
    vAlpha = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.35, 1.0, t));
    vSeed = aSeed;

    gl_PointSize = uSize * aScale * grow * uPixelRatio * (60.0 / -mv.z);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    // Soft-edged blob with a slightly brighter core. The core boost is kept
    // small: on an additive field, overlapping particles stack it and the
    // whole cloud saturates to featureless white.
    float a = smoothstep(0.5, 0.06, d);
    float core = smoothstep(0.36, 0.0, d) * 0.12;
    gl_FragColor = vec4(uColor + core, a * vAlpha * uOpacity);
    #include <colorspace_fragment>
  }
`;

export const Puffs = forwardRef<PuffHandle, Props>(function Puffs(
  {
    count = 220,
    color = "#FFFFFF",
    gravity = 1.1,
    growth = 2.4,
    opacity = 0.5,
    additive = false,
    size = 26,
  },
  ref
) {
  const cursor = useRef(0);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const birth = new Float32Array(count).fill(-1000);
    const life = new Float32Array(count).fill(1);
    const scale = new Float32Array(count).fill(1);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) seed[i] = Math.random();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aVel", new THREE.BufferAttribute(vel, 3));
    g.setAttribute("aBirth", new THREE.BufferAttribute(birth, 1));
    g.setAttribute("aLife", new THREE.BufferAttribute(life, 1));
    g.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    // Frustum culling on a cloud that moves every frame just causes pops.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uGravity: { value: gravity },
          uGrowth: { value: growth },
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
          uSize: { value: size },
          uPixelRatio: { value: 1 },
        },
      }),
    [additive, gravity, growth, color, opacity, size]
  );

  const clock = useRef(0);
  /**
   * Marking `needsUpdate` re-uploads the *entire* attribute to the GPU. Doing
   * that inside every spawn meant five full buffer uploads per particle, and
   * a burst spawns dozens in one frame. The flag is now raised here and
   * flushed once per frame in useFrame — same result, one upload.
   */
  const dirty = useRef(false);

  useImperativeHandle(ref, () => {
    const write = (
      x: number,
      y: number,
      z: number,
      o: { scale?: number; life?: number; vx?: number; vy?: number; vz?: number; spread?: number } = {}
    ) => {
      const i = cursor.current;
      cursor.current = (i + 1) % count;
      const p = geom.attributes.position as THREE.BufferAttribute;
      const v = geom.attributes.aVel as THREE.BufferAttribute;
      const b = geom.attributes.aBirth as THREE.BufferAttribute;
      const l = geom.attributes.aLife as THREE.BufferAttribute;
      const s = geom.attributes.aScale as THREE.BufferAttribute;
      const sp = o.spread ?? 0.14;
      p.setXYZ(
        i,
        x + (Math.random() - 0.5) * sp,
        y + (Math.random() - 0.5) * sp,
        z + (Math.random() - 0.5) * sp
      );
      v.setXYZ(i, o.vx ?? 0, o.vy ?? 0, o.vz ?? 0);
      b.setX(i, clock.current);
      l.setX(i, o.life ?? 1.6);
      s.setX(i, (o.scale ?? 1) * (0.7 + Math.random() * 0.6));
      dirty.current = true;
    };

    return {
      spawn: write,
      burst: (x, y, z, n, o = {}) => {
        const speed = o.speed ?? 2.2;
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random();
          write(x, y, z, {
            scale: o.scale ?? 1,
            life: (o.life ?? 1.4) * (0.7 + Math.random() * 0.6),
            vx: Math.cos(a) * r * speed,
            vy: (o.up ?? 0.4) * (0.4 + Math.random()),
            vz: Math.sin(a) * r * speed,
            spread: 0.3,
          });
        }
      },
    };
  }, [count, geom]);

  useFrame((state, dt) => {
    clock.current += Math.min(dt, 0.05);
    material.uniforms.uTime.value = clock.current;
    material.uniforms.uPixelRatio.value = state.viewport.dpr;
    if (dirty.current) {
      dirty.current = false;
      geom.attributes.position.needsUpdate = true;
      geom.attributes.aVel.needsUpdate = true;
      geom.attributes.aBirth.needsUpdate = true;
      geom.attributes.aLife.needsUpdate = true;
      geom.attributes.aScale.needsUpdate = true;
    }
  });

  return <points geometry={geom} material={material} frustumCulled={false} />;
});
