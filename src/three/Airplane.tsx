"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { memo, useMemo, useRef } from "react";
import { flight, tickFlight } from "@/lib/flight";
import { G, PALETTE, glass, glow, mat } from "./shared";
import { Puffs, type PuffHandle } from "./effects/Puffs";
import { updateEngine, sfx } from "@/lib/audio";
import { useGame } from "@/lib/store";
import { clamp, damp } from "@/lib/math";

/**
 * The toy airplane.
 *
 * Deliberately *not* an aircraft. The proportions are wrong on purpose:
 * the nose is stubby, the wheels are too big, the cabin is a bubble. Every
 * measurement here was chosen to read as "a thing carved in a workshop",
 * which is why the propeller is wood and the panel lines are visible seams
 * rather than textures.
 *
 * Forward is -Z, matching three.js convention, so the flight system's
 * lookAt quaternions drive it without any correction.
 */

const BODY = PALETTE.planeBody;
const CREAM = PALETTE.planeCream;

/* ------------------------------------------------------------------ */
/* Propeller — wooden blades + a blur disc that takes over at speed     */
/* ------------------------------------------------------------------ */

const BLUR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const BLUR_FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c) * 2.0;
    // A ring, brightest where the blade tips sweep, hollow at the hub.
    float ring = smoothstep(0.15, 0.55, d) * (1.0 - smoothstep(0.86, 1.0, d));
    float streak = 0.75 + 0.25 * sin(atan(c.y, c.x) * 9.0);
    gl_FragColor = vec4(uColor, ring * streak * uOpacity * 0.55);
    #include <colorspace_fragment>
  }
`;

function Propeller() {
  const blades = useRef<THREE.Group>(null);
  const blur = useRef<THREE.Mesh>(null);
  const bladeMat = useRef<THREE.MeshStandardMaterial>(null);

  const blurMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BLUR_VERT,
        fragmentShader: BLUR_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color(PALETTE.woodLight) },
        },
      }),
    []
  );

  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z = flight.prop;
    // Above ~0.35 throttle the eye can't resolve the blades any more, so we
    // dissolve them into a disc. Doing both at once is what sells it.
    const t = clamp((flight.throttle - 0.22) / 0.5, 0, 1);
    blurMat.uniforms.uOpacity.value = damp(blurMat.uniforms.uOpacity.value, t, 6, dt);
    if (blur.current) blur.current.visible = blurMat.uniforms.uOpacity.value > 0.01;
    if (bladeMat.current) {
      bladeMat.current.opacity = damp(bladeMat.current.opacity, 1 - t * 0.82, 6, dt);
    }
  });

  return (
    <group position={[0, 0.12, -1.62]}>
      {/* spinner cone */}
      <mesh geometry={G.cone} material={mat(PALETTE.planeGold, { roughness: 0.35 })}
        position={[0, 0, -0.13]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.13, 0.22, 0.13]} castShadow />
      {/* hub */}
      <mesh geometry={G.cyl} material={mat(PALETTE.woodDark)} rotation={[Math.PI / 2, 0, 0]}
        scale={[0.085, 0.1, 0.085]} castShadow />
      <group ref={blades}>
        {[0, 1].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 1]}>
            <mesh position={[0, 0.42, 0]} rotation={[0.34, 0, 0]} castShadow>
              <boxGeometry args={[0.11, 0.78, 0.028]} />
              <meshStandardMaterial
                ref={i === 0 ? bladeMat : undefined}
                color={PALETTE.woodLight}
                roughness={0.62}
                transparent
              />
            </mesh>
            {/* grain stripe — hand-painted toy detail */}
            <mesh position={[0, 0.42, 0.017]} rotation={[0.34, 0, 0]}>
              <boxGeometry args={[0.028, 0.7, 0.004]} />
              <meshStandardMaterial color={PALETTE.woodDark} roughness={0.7} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh ref={blur} material={blurMat} position={[0, 0, 0.02]}>
        <circleGeometry args={[0.58, 28]} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Wheels                                                              */
/* ------------------------------------------------------------------ */

function Wheel({ x, z, r = 0.19 }: { x: number; z: number; r?: number }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.x += flight.speed * dt * 0.5;
  });
  return (
    <group position={[x, -0.44, z]}>
      {/* strut */}
      <mesh geometry={G.cylLo} material={mat(PALETTE.steel, { metalness: 0.3, roughness: 0.4 })}
        position={[0, 0.16, 0]} scale={[0.035, 0.3, 0.035]} />
      <group ref={spin}>
        <mesh geometry={G.torus} material={mat(PALETTE.rubber, { roughness: 0.9 })}
          rotation={[0, Math.PI / 2, 0]} scale={[r, r, r]} castShadow />
        <mesh geometry={G.cyl} material={mat(PALETTE.planeGold, { roughness: 0.4 })}
          rotation={[0, 0, Math.PI / 2]} scale={[r * 0.55, 0.09, r * 0.55]} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Blinking navigation lights                                          */
/* ------------------------------------------------------------------ */

function NavLight({
  position,
  color,
  phase,
}: {
  position: [number, number, number];
  color: string;
  phase: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const m = useMemo(() => glow(color, 3), [color]);
  useFrame(({ clock }) => {
    // A real strobe: mostly dark, brief bright flash.
    const t = (clock.elapsedTime * 1.1 + phase) % 1;
    const on = t < 0.11 ? 1 : t < 0.2 ? 0.35 : 0.08;
    const lit = on * (0.35 + flight.throttle * 0.65);
    m.emissiveIntensity = 0.6 + lit * 5;
    const s = 0.038 + lit * 0.012;
    if (ref.current) ref.current.scale.setScalar(s);
    if (halo.current) {
      halo.current.scale.setScalar(s * (3 + lit * 4));
      (halo.current.material as THREE.Material).opacity = lit * 0.28;
    }
  });
  return (
    <group position={position}>
      <mesh ref={ref} geometry={G.sphereLo} material={m} />
      <mesh ref={halo} geometry={G.sphereLo}>
        <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The plane                                                           */
/* ------------------------------------------------------------------ */

function PlaneModel() {
  return (
    <group>
      {/* ---- fuselage: a rounded body with a cream belly ------------ */}
      <mesh castShadow receiveShadow position={[0, 0, -0.05]}>
        <capsuleGeometry args={[0.33, 1.5, 6, 18]} />
        <meshStandardMaterial color={BODY} roughness={0.55} />
      </mesh>
      {/* belly panel — a second colour so the silhouette reads in shadow */}
      <mesh position={[0, -0.2, -0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.24, 1.4, 4, 14]} />
        <meshStandardMaterial color={CREAM} roughness={0.6} />
      </mesh>
      {/* nose cap */}
      <mesh geometry={G.sphere} material={mat(PALETTE.planeBodyDark, { roughness: 0.45 })}
        position={[0, 0.06, -1.45]} scale={[0.3, 0.28, 0.24]} castShadow />
      {/* hand-painted racing stripe */}
      <mesh position={[0, 0.02, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.341, 1.05, 3, 16]} />
        <meshStandardMaterial color={PALETTE.planeGold} roughness={0.5} />
      </mesh>

      {/* ---- canopy bubble ------------------------------------------ */}
      <mesh geometry={G.sphere} material={glass("#CFEFFF", 0.42)} position={[0, 0.31, -0.34]}
        scale={[0.27, 0.26, 0.44]} />
      <mesh geometry={G.torus} material={mat(PALETTE.woodDark)} position={[0, 0.3, -0.34]}
        rotation={[Math.PI / 2, 0, 0]} scale={[0.28, 0.28, 0.04]} />

      {/* ---- wings --------------------------------------------------- */}
      <group position={[0, -0.02, -0.16]}>
        <RoundedBox args={[3.5, 0.11, 0.78]} radius={0.05} smoothness={3} castShadow receiveShadow>
          <meshStandardMaterial color={CREAM} roughness={0.6} />
        </RoundedBox>
        {/* wingtip caps */}
        {[-1, 1].map((s) => (
          <RoundedBox key={s} args={[0.42, 0.13, 0.72]} radius={0.055} smoothness={3}
            position={[s * 1.62, 0.005, 0]} castShadow>
            <meshStandardMaterial color={BODY} roughness={0.55} />
          </RoundedBox>
        ))}
        {/* underwing struts */}
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={G.cylLo} material={mat(PALETTE.woodDark)}
            position={[s * 0.62, -0.16, 0]} rotation={[0, 0, s * 0.34]} scale={[0.03, 0.34, 0.03]} />
        ))}
      </group>

      {/* ---- tail ---------------------------------------------------- */}
      <group position={[0, 0.12, 1.16]}>
        {/* vertical fin */}
        <RoundedBox args={[0.1, 0.68, 0.6]} radius={0.045} smoothness={3} position={[0, 0.34, 0.12]}
          castShadow>
          <meshStandardMaterial color={BODY} roughness={0.55} />
        </RoundedBox>
        <RoundedBox args={[0.115, 0.2, 0.32]} radius={0.04} smoothness={3} position={[0, 0.56, 0.2]}>
          <meshStandardMaterial color={PALETTE.planeGold} roughness={0.5} />
        </RoundedBox>
        {/* horizontal stabiliser */}
        <RoundedBox args={[1.32, 0.09, 0.44]} radius={0.04} smoothness={3} castShadow>
          <meshStandardMaterial color={CREAM} roughness={0.6} />
        </RoundedBox>
        {[-1, 1].map((s) => (
          <RoundedBox key={s} args={[0.22, 0.1, 0.4]} radius={0.04} smoothness={3}
            position={[s * 0.6, 0, 0]}>
            <meshStandardMaterial color={BODY} roughness={0.55} />
          </RoundedBox>
        ))}
      </group>

      {/* ---- workshop details ---------------------------------------- */}
      {/* visible screws where the wings meet the body */}
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} geometry={G.cylLo} material={mat(PALETTE.steelDark, { metalness: 0.5, roughness: 0.35 })}
          position={[x, 0.06, -0.16]} scale={[0.035, 0.02, 0.035]} />
      ))}
      {/* exhaust stub — where the smoke comes from */}
      <mesh geometry={G.cylLo} material={mat(PALETTE.steelDark, { metalness: 0.4, roughness: 0.4 })}
        position={[0.2, -0.18, -0.9]} rotation={[Math.PI / 2, 0, 0]} scale={[0.05, 0.3, 0.05]} />

      <Propeller />

      <Wheel x={-0.62} z={-0.5} />
      <Wheel x={0.62} z={-0.5} />
      <Wheel x={0} z={1.02} r={0.12} />

      <NavLight position={[-1.78, 0.03, -0.16]} color="#FF4D5E" phase={0} />
      <NavLight position={[1.78, 0.03, -0.16]} color="#5CFF8F" phase={0.5} />
      <NavLight position={[0, 0.86, 1.34]} color="#FFE07A" phase={0.25} />
    </group>
  );
}

const MemoPlaneModel = memo(PlaneModel);

/* ------------------------------------------------------------------ */

export function Airplane() {
  const group = useRef<THREE.Group>(null);
  const smoke = useRef<PuffHandle>(null);
  const dust = useRef<PuffHandle>(null);
  const spark = useRef<PuffHandle>(null);
  const acc = useRef(0);
  const wasLanded = useRef(false);
  const prevScale = useRef(1);
  const lowPower = useGame((s) => s.lowPower);
  const muted = useGame((s) => s.muted);

  const exhaust = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    tickFlight(dt, state.clock.elapsedTime);
    const g = group.current;
    if (!g) return;

    g.position.copy(flight.pos);
    g.quaternion.copy(flight.quat);

    /* --- warp fold ------------------------------------------------ */
    // The toy folds to nothing and unfolds on the far pad. Rolling about
    // the nose axis (after the quaternion copy, so it is local) is what
    // makes it read as being wound away rather than simply scaled down.
    const vs = flight.visualScale;
    if (vs < 0.999) {
      g.scale.setScalar(Math.max(0.0001, vs));
      g.visible = vs > 0.004;
      g.rotateZ(flight.warpSpin);
    } else if (g.scale.x !== 1) {
      g.scale.setScalar(1);
      g.visible = true;
    }

    // Fold and unfold each throw a puff of dust.
    if (vs < 0.16 && prevScale.current >= 0.16) {
      spark.current?.burst(flight.pos.x, flight.pos.y, flight.pos.z, 26, {
        scale: 0.7, life: 0.9, speed: 5, up: 0.5,
      });
    } else if (vs > 0.16 && prevScale.current <= 0.16) {
      spark.current?.burst(flight.pos.x, flight.pos.y, flight.pos.z, 30, {
        scale: 0.8, life: 1.1, speed: 4.5, up: 0.7,
      });
    }
    prevScale.current = vs;

    // Idle bob only applies on the ground; in the air the curve owns Y.
    if (flight.mode === "parked" || flight.mode === "finale") {
      g.position.y += flight.bob.value * 0.12;
    }

    if (!muted) updateEngine(flight.throttle, flight.speed);

    /* --- exhaust trail ------------------------------------------- */
    // Rate-limited by distance travelled, not by frame count, so the trail
    // has consistent spacing whether we're at 30fps or 144fps.
    if (flight.mode !== "warp" && flight.throttle > 0.2 && smoke.current) {
      acc.current += flight.speed * dt + dt * 2;
      const step = lowPower ? 1.4 : 0.55;
      while (acc.current > step) {
        acc.current -= step;
        exhaust.set(0.2, -0.18, -0.75).applyQuaternion(flight.quat).add(flight.pos);
        smoke.current.spawn(exhaust.x, exhaust.y, exhaust.z, {
          scale: 0.35 + flight.throttle * 0.4,
          life: 1.0 + flight.throttle * 0.7,
          vy: 0.45,
          spread: 0.12,
        });
      }
    }

    /* --- touchdown dust + engine-start sparks --------------------- */
    const landing = flight.justLanded > 0;
    if (landing && !wasLanded.current) {
      wasLanded.current = true;
      dust.current?.burst(flight.pos.x, flight.pos.y - 0.55, flight.pos.z, lowPower ? 12 : 30, {
        scale: 1.5,
        life: 1.5,
        speed: 3.4,
        up: 0.5,
      });
      if (!muted) sfx("land");
    }
    if (!landing) wasLanded.current = false;

    // Engine cough on spool-up: a couple of sparks out of the exhaust.
    if (flight.throttle > 0.05 && flight.throttle < 0.4 && Math.random() < dt * 4 && spark.current) {
      exhaust.set(0.2, -0.18, -0.75).applyQuaternion(flight.quat).add(flight.pos);
      spark.current.burst(exhaust.x, exhaust.y, exhaust.z, 3, {
        scale: 0.28,
        life: 0.5,
        speed: 1.1,
        up: 0.6,
      });
    }
  });

  return (
    <>
      <group ref={group}>
        <MemoPlaneModel />
        {/* Warm bounce light so the toy never goes flat against a dark sky. */}
        <pointLight position={[0, 0.6, -1]} color="#FFD9A0" intensity={2.4} distance={7} decay={2} />

        {/* Double-click hit volume — turbo mode. Invisible, generous, and
            deliberately not discoverable from the UI. */}
        <mesh
          visible={false}
          onDoubleClick={(e) => {
            e.stopPropagation();
            const g = useGame.getState();
            g.toggleTurbo();
            if (!g.muted) sfx("power");
            g.say(
              g.turbo ? "Turbo disengaged. Cruising." : "TURBO ENGAGED. Hold on to something.",
              "reward"
            );
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <sphereGeometry args={[1.9, 10, 7]} />
        </mesh>
      </group>

      {/* `size` is "pixels at 60 units from the camera" — the chase camera
          sits at ~11, so anything above single digits becomes a fog bank. */}
      <Puffs ref={smoke} count={lowPower ? 90 : 240} color="#F2F6FA" gravity={1.35} growth={2.4}
        opacity={0.26} size={7} />
      <Puffs ref={dust} count={70} color="#E8D8BE" gravity={-1.6} growth={3} opacity={0.42} size={15} />
      <Puffs ref={spark} count={40} color="#FFB347" gravity={-0.6} growth={0.6} opacity={0.9}
        size={5} additive />
    </>
  );
}
