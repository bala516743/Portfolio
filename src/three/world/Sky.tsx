"use client";

import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { useGame } from "@/lib/store";
import { sfx } from "@/lib/audio";
import { dayMix } from "./daylight";

/**
 * Sky dome, sun, moon, stars, rainbow.
 *
 * The dome is parented to the camera position each frame so it is
 * effectively at infinity, and the star field lives inside the same
 * fragment shader rather than as three thousand points — at this distance
 * a procedural hash is indistinguishable and costs one draw call less.
 */

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uDayTop, uDayHorizon;
  uniform vec3 uNightTop, uNightHorizon;
  uniform vec3 uSunDir;
  uniform float uNight;
  uniform float uTime;
  varying vec3 vDir;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

    vec3 top = mix(uDayTop, uNightTop, uNight);
    vec3 hor = mix(uDayHorizon, uNightHorizon, uNight);
    // Bias the gradient toward the horizon so most of the visible sky is
    // the warm band rather than flat zenith blue.
    vec3 col = mix(hor, top, pow(h, 0.85));

    // Sun/moon bloom, always present, warmer by day.
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    vec3 glowCol = mix(vec3(1.0, 0.86, 0.6), vec3(0.72, 0.8, 1.0), uNight);
    col += glowCol * pow(sd, 22.0) * (0.55 - uNight * 0.2);
    col += glowCol * pow(sd, 4.0) * 0.07;

    // Stars — only above the horizon, only at night.
    if (uNight > 0.01 && d.y > -0.05) {
      vec3 g = floor(d * 190.0);
      float s = hash31(g);
      float star = smoothstep(0.9965, 0.9995, s);
      float tw = 0.55 + 0.45 * sin(uTime * 2.2 + s * 100.0);
      col += vec3(0.95, 0.97, 1.0) * star * tw * uNight * smoothstep(-0.05, 0.25, d.y);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */

function Rainbow() {
  const show = useGame((s) => s.rainbow);
  const ref = useRef<THREE.Mesh>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          varying vec2 vUv;
          vec3 band(float t) {
            // Hand-picked arc colours — a hue ramp reads too neon for this world.
            if (t < 0.16) return vec3(0.94, 0.35, 0.35);
            if (t < 0.33) return vec3(0.97, 0.66, 0.33);
            if (t < 0.50) return vec3(0.98, 0.89, 0.42);
            if (t < 0.66) return vec3(0.52, 0.85, 0.52);
            if (t < 0.83) return vec3(0.45, 0.70, 0.94);
            return vec3(0.68, 0.53, 0.90);
          }
          void main() {
            float t = vUv.y;
            // Fade both edges and both ends so it dissolves into the sky.
            float edge = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.86, 1.0, t));
            float ends = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
            gl_FragColor = vec4(band(t), edge * ends * uOpacity * 0.5);
            #include <colorspace_fragment>
          }
        `,
      }),
    []
  );

  useFrame((_, dt) => {
    const target = show ? 1 : 0;
    const u = material.uniforms.uOpacity;
    u.value += (target - u.value) * (1 - Math.exp(-1.6 * dt));
    if (ref.current) ref.current.visible = u.value > 0.005;
  });

  return (
    <mesh ref={ref} material={material} position={[90, -30, -105]} rotation={[0, 0.4, 0]}>
      {/* A half-torus: thetaLength = PI gives the arc, not a ring. */}
      <torusGeometry args={[190, 26, 2, 90, Math.PI]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */

export function SkyDome() {
  const group = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const toggleTime = useGame((s) => s.toggleTime);
  const say = useGame((s) => s.say);
  const muted = useGame((s) => s.muted);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uDayTop: { value: new THREE.Color("#6FB6EE") },
          uDayHorizon: { value: new THREE.Color("#FFE2C0") },
          uNightTop: { value: new THREE.Color("#0B1233") },
          uNightHorizon: { value: new THREE.Color("#2B2A5E") },
          uSunDir: { value: new THREE.Vector3(-0.45, 0.42, -0.78).normalize() },
          uNight: { value: 0 },
          uTime: { value: 0 },
        },
      }),
    []
  );

  /**
   * The sun's halo.
   *
   * A SpriteMaterial with no `map` renders as a solid quad — which is a
   * 190-unit white rectangle nailed to the sky the moment the camera
   * happens to look at the sun. The gradient below is what makes it a glow.
   */
  const sunGlow = useMemo(() => {
    const size = 128;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.12, "rgba(255,240,200,0.85)");
    g.addColorStop(0.35, "rgba(255,225,160,0.28)");
    g.addColorStop(0.7, "rgba(255,215,140,0.06)");
    g.addColorStop(1, "rgba(255,210,130,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color("#FFE9A8"),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  const bodyMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#FFF3C4") }),
    []
  );

  const hovered = useRef(false);

  useFrame(({ clock }) => {
    // Keep the dome centred on the viewer: an infinite sky with no parallax.
    if (group.current) group.current.position.copy(camera.position);
    material.uniforms.uNight.value = dayMix.night;
    material.uniforms.uTime.value = clock.elapsedTime;

    // The sun sinks and the moon takes its place — one body, two costumes.
    const n = dayMix.night;
    bodyMat.color.lerpColors(
      new THREE.Color("#FFF3C4"),
      new THREE.Color("#E8ECFF"),
      n
    );
    sunGlow.color.lerpColors(
      new THREE.Color("#FFE9A8"),
      new THREE.Color("#AFC4FF"),
      n
    );
    sunGlow.opacity = (0.55 - n * 0.28) * (hovered.current ? 1.5 : 1);
    if (sunRef.current) {
      const s = hovered.current ? 1.12 : 1;
      sunRef.current.scale.lerp(new THREE.Vector3(s, s, s), 0.12);
    }
  });

  const sunDir = new THREE.Vector3(-0.45, 0.42, -0.78).normalize().multiplyScalar(430);

  return (
    <group ref={group}>
      <mesh material={material} frustumCulled={false}>
        <sphereGeometry args={[500, 32, 20]} />
      </mesh>

      {/* The sun. Clicking it flips day to night — the first easter egg
          most people find, so its hit area is generous on purpose. */}
      <group ref={sunRef} position={sunDir}>
        <mesh
          material={bodyMat}
          onClick={(e) => {
            e.stopPropagation();
            toggleTime();
            if (!muted) sfx("chime");
            say(
              useGame.getState().time === "day" ? "Sunset engaged. Watch the windows." : "Sunrise. Good morning, Captain.",
              "reward"
            );
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            hovered.current = true;
            document.body.style.cursor = "pointer";
            if (!muted) sfx("hover");
          }}
          onPointerOut={() => {
            hovered.current = false;
            document.body.style.cursor = "";
          }}
        >
          <sphereGeometry args={[26, 20, 14]} />
        </mesh>
        <sprite material={sunGlow} scale={[190, 190, 1]} />
      </group>

      <Rainbow />
    </group>
  );
}
