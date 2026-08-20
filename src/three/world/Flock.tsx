"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { flight } from "@/lib/flight";

/**
 * Birds, butterflies, and anything else with wings.
 *
 * Every creature's flight path, heading, banking and wing flap is solved in
 * the vertex shader from a single seed attribute. The CPU writes four
 * uniforms per frame no matter whether there are twelve butterflies or two
 * hundred birds — which is what lets the world stay this busy at 60fps.
 */

const VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aShade;

  uniform float uTime;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uSpeed;
  uniform float uVertical;
  uniform float uFlapRate;
  uniform float uFlapAmt;
  uniform float uScale;
  uniform vec3 uFollow;
  uniform float uFollowAmt;

  varying float vShade;

  void main() {
    float s = aSeed;

    // --- where this creature is right now ---------------------------
    float ang = uTime * uSpeed * (0.55 + s * 0.9) + s * 6.2831;
    float r = uRadius * (0.5 + s * 1.0);
    vec3 c = uCenter + vec3(
      cos(ang) * r,
      sin(uTime * 0.45 + s * 6.0) * uVertical,
      sin(ang) * r * 0.82
    );

    // --- optionally chase the aeroplane, each with its own lag ------
    if (uFollowAmt > 0.001) {
      // Wide orbit: close enough to read as an escort, far enough that they
      // never fly between the chase camera and the aeroplane.
      float lag = 11.0 + s * 16.0;
      vec3 target = uFollow + vec3(
        cos(ang * 1.4) * lag,
        2.5 + sin(ang * 1.1 + s * 3.0) * 2.2,
        sin(ang * 1.4) * lag
      );
      c = mix(c, target, uFollowAmt);
    }

    // --- heading from the derivative of the path --------------------
    vec3 fwd = normalize(vec3(-sin(ang) * r, 0.0, cos(ang) * r * 0.82) + vec3(0.0001));
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, fwd));
    vec3 realUp = cross(fwd, right);

    // Bank into the curve — even a bird leans.
    float bank = 0.35 * sign(uSpeed);
    right = normalize(right + realUp * bank * 0.0);

    // --- wing flap ---------------------------------------------------
    float flap = sin(uTime * uFlapRate + s * 21.0);
    vec3 p = position;
    p.y += abs(p.x) * flap * uFlapAmt;
    p.x *= 1.0 - abs(flap) * uFlapAmt * 0.22;
    p *= uScale;

    vec3 world = c + right * p.x + realUp * p.y + fwd * p.z;

    // Wings catch light as they rise, lose it as they fall.
    vShade = aShade * (0.78 + 0.22 * (flap * 0.5 + 0.5));

    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(world, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColorB;
  uniform float uOpacity;
  varying float vShade;
  void main() {
    vec3 col = mix(uColorB, uColor, vShade);
    gl_FragColor = vec4(col * vShade, uOpacity);
    #include <colorspace_fragment>
  }
`;

type Kind = "bird" | "butterfly";

type Props = {
  count?: number;
  kind?: Kind;
  center: [number, number, number];
  radius?: number;
  vertical?: number;
  speed?: number;
  scale?: number;
  color?: string;
  colorB?: string;
  /** Lets the flock chase the aeroplane (the "birds follow you" egg). */
  follow?: boolean;
  opacity?: number;
};

/** One creature's local wing geometry, mirrored about x. */
function wingShape(kind: Kind) {
  if (kind === "bird") {
    // A shallow V: two triangles meeting at the body.
    return [
      // left wing
      [0, 0, 0.1, -0.55, 0.1, -0.2, -0.05, 0, -0.1],
      // right wing
      [0, 0, 0.1, 0.05, 0, -0.1, 0.55, 0.1, -0.2],
      // body sliver, so it isn't invisible edge-on
      [0, 0, 0.16, -0.05, -0.02, -0.22, 0.05, -0.02, -0.22],
    ];
  }
  // Butterfly: four rounded-ish quads, wider and shorter.
  return [
    [0, 0, 0, -0.42, 0.02, 0.3, -0.3, 0.02, -0.08],
    [0, 0, 0, -0.3, 0.02, -0.08, -0.24, 0.02, -0.34],
    [0, 0, 0, 0.3, 0.02, -0.08, 0.42, 0.02, 0.3],
    [0, 0, 0, 0.24, 0.02, -0.34, 0.3, 0.02, -0.08],
  ];
}

export function Flock({
  count = 40,
  kind = "bird",
  center,
  radius = 40,
  vertical = 6,
  speed = 0.3,
  scale = 1,
  color = "#3E4A63",
  colorB = "#8A97AE",
  follow = false,
  opacity = 1,
}: Props) {
  const followAmt = useRef(0);

  const geom = useMemo(() => {
    const tris = wingShape(kind);
    const perCreature = tris.length * 3;
    const total = count * perCreature;
    const pos = new Float32Array(total * 3);
    const seed = new Float32Array(total);
    const shade = new Float32Array(total);

    let v = 0;
    for (let c = 0; c < count; c++) {
      const s = Math.random();
      for (let t = 0; t < tris.length; t++) {
        const tri = tris[t];
        for (let k = 0; k < 3; k++, v++) {
          pos[v * 3] = tri[k * 3];
          pos[v * 3 + 1] = tri[k * 3 + 1];
          pos[v * 3 + 2] = tri[k * 3 + 2];
          seed[v] = s;
          // Alternate faces slightly so wings read as separate surfaces.
          shade[v] = 0.72 + (t % 2) * 0.28;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aShade", new THREE.BufferAttribute(shade, 1));
    // The shader relocates everything; a real bounding sphere would be a lie.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...center), radius * 3 + 200);
    return g;
  }, [count, kind, center, radius]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        depthWrite: opacity >= 1,
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector3(...center) },
          uRadius: { value: radius },
          uSpeed: { value: speed },
          uVertical: { value: vertical },
          uFlapRate: { value: kind === "bird" ? 9 : 15 },
          uFlapAmt: { value: kind === "bird" ? 0.85 : 1.25 },
          uScale: { value: scale },
          uColor: { value: new THREE.Color(color) },
          uColorB: { value: new THREE.Color(colorB) },
          uOpacity: { value: opacity },
          uFollow: { value: new THREE.Vector3() },
          uFollowAmt: { value: 0 },
        },
      }),
    [center, radius, speed, vertical, kind, scale, color, colorB, opacity]
  );

  useFrame(({ clock }, dt) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    if (follow) {
      // Birds peel off to join you, then peel away again — the transition
      // is slow enough (≈4s) that you notice them arriving.
      const want = flight.mode === "free" || flight.mode === "takeoff" ? 1 : 0;
      followAmt.current += (want - followAmt.current) * (1 - Math.exp(-0.55 * dt));
      material.uniforms.uFollowAmt.value = followAmt.current;
      material.uniforms.uFollow.value.copy(flight.pos);
    }
  });

  return <mesh geometry={geom} material={material} frustumCulled={false} />;
}
