"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";

/**
 * Drifting motes — dust in a sunbeam, pollen over a meadow, fireflies at
 * night, sparks over the factory floor.
 *
 * Positions are computed entirely on the GPU from a birth offset, so the
 * CPU cost per field is one uniform write per frame regardless of count.
 */

const VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aScale;
  uniform float uTime;
  uniform vec3 uArea;
  uniform float uSpeed;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vTwinkle;

  void main() {
    vec3 p = position;
    float s = aSeed * 6.2831;

    // Each mote traces its own lazy lissajous inside the volume.
    p.x += sin(uTime * uSpeed * 0.37 + s) * uArea.x * 0.16;
    p.y += sin(uTime * uSpeed * 0.23 + s * 1.7) * uArea.y * 0.13;
    p.z += cos(uTime * uSpeed * 0.31 + s * 2.3) * uArea.z * 0.16;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Never fully dark — a mote that blinks out reads as a rendering bug.
    vTwinkle = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 1.9 + s * 3.1));
    gl_PointSize = uSize * aScale * uPixelRatio * (48.0 / -mv.z);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vTwinkle * uOpacity);
    #include <colorspace_fragment>
  }
`;

type Props = {
  count?: number;
  area?: [number, number, number];
  color?: string;
  size?: number;
  speed?: number;
  opacity?: number;
  additive?: boolean;
};

export function Motes({
  count = 120,
  area = [10, 6, 10],
  color = "#FFF0CC",
  size = 8,
  speed = 1,
  opacity = 0.7,
  additive = true,
}: Props) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const scale = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * area[0];
      pos[i * 3 + 1] = (Math.random() - 0.5) * area[1];
      pos[i * 3 + 2] = (Math.random() - 0.5) * area[2];
      seed[i] = Math.random();
      scale[i] = 0.5 + Math.random() * 0.9;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
    return g;
  }, [count, area]);

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
          uArea: { value: new THREE.Vector3(...area) },
          uSpeed: { value: speed },
          uSize: { value: size },
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
          uPixelRatio: { value: 1 },
        },
      }),
    [additive, area, speed, size, color, opacity]
  );

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uPixelRatio.value = state.viewport.dpr;
  });

  return <points ref={matRef as never} geometry={geom} material={material} />;
}
