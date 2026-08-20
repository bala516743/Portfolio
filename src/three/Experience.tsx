"use client";

import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor, Preload } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import {
  flight,
  tickFlight,
  resetFlight,
  beginTakeoff,
  beginWarp,
} from "@/lib/flight";
import { attachInput } from "@/lib/input";
import { useGame } from "@/lib/store";
import { damp, wobble } from "@/lib/math";
import { sfx, duckMusic } from "@/lib/audio";
import { DAY, NIGHT, dayMix } from "./world/daylight";
import { windUniforms } from "./world/wind";

import { Airplane } from "./Airplane";
import { SkyDome } from "./world/Sky";
import { Weather } from "./world/Weather";
import { Life } from "./world/Life";
import { Collectibles } from "./world/Collectibles";

import { HomeAirport } from "./islands/HomeAirport";
import { ObjectiveIsland } from "./islands/ObjectiveIsland";
import { SkillsLab } from "./islands/SkillsLab";
import { ExperienceCity } from "./islands/ExperienceCity";
import { ProjectKingdom } from "./islands/ProjectKingdom";
import { AchievementMuseum } from "./islands/AchievementMuseum";
import { ContactAirport } from "./islands/ContactAirport";

/* ------------------------------------------------------------------ */
/* Camera rig                                                          */
/* ------------------------------------------------------------------ */

const _up = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();

function Rig() {
  const { camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const shakeOffset = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    tickFlight(dt, state.clock.elapsedTime);

    cam.position.copy(flight.camPos);

    // Impact shake applied after the smoothed position, so it reads as the
    // camera being knocked rather than the whole rig wobbling.
    if (flight.shake > 0.001) {
      const s = flight.shake * flight.shake * 0.9;
      shakeOffset.set(
        wobble(state.clock.elapsedTime * 34, 1) * s,
        wobble(state.clock.elapsedTime * 41, 2) * s,
        wobble(state.clock.elapsedTime * 29, 3) * s
      );
      cam.position.add(shakeOffset);
    }

    cam.up.copy(_up);
    cam.lookAt(flight.camLook);
    // Roll last: lookAt resets the up vector, so the tilt has to come after.
    cam.rotateZ(flight.camRoll);

    if (Math.abs(cam.fov - flight.camFov) > 0.01) {
      cam.fov = damp(cam.fov, flight.camFov, 4, dt);
      cam.updateProjectionMatrix();
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Lighting                                                            */
/* ------------------------------------------------------------------ */

function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const time = useGame((s) => s.time);
  const lowPower = useGame((s) => s.lowPower);
  const { scene } = useThree();

  const fog = useMemo(() => new THREE.Fog(DAY.fog.getHex(), DAY.fogNear, DAY.fogFar), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  const c = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    // One eased value drives sky, fog, every lamp and every window.
    dayMix.night = damp(dayMix.night, time === "night" ? 1 : 0, 0.9, dt);
    const n = dayMix.night;

    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(DAY.sunIntensity, NIGHT.sunIntensity, n);
      sun.current.color.copy(c.copy(DAY.sun).lerp(NIGHT.sun, n));
      // A 500-unit shadow frustum would be useless, so the sun rides along
      // with the plane and its map always covers what is on screen.
      _tmp.copy(flight.pos);
      sun.current.position.set(_tmp.x - 42, _tmp.y + 58, _tmp.z - 34);
      sun.current.target.position.copy(_tmp);
      sun.current.target.updateMatrixWorld();
    }
    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.lerp(
        DAY.ambientIntensity,
        NIGHT.ambientIntensity,
        n
      );
      ambient.current.color.copy(c.copy(DAY.ambient).lerp(NIGHT.ambient, n));
    }
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(DAY.hemiIntensity, NIGHT.hemiIntensity, n);
      hemi.current.color.copy(c.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, n));
      hemi.current.groundColor.copy(c.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, n));
    }
    fog.color.copy(c.copy(DAY.fog).lerp(NIGHT.fog, n));
    fog.near = THREE.MathUtils.lerp(DAY.fogNear, NIGHT.fogNear, n);
    fog.far = THREE.MathUtils.lerp(DAY.fogFar, NIGHT.fogFar, n);

    windUniforms.uTime.value += dt;
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={DAY.ambientIntensity} color={DAY.ambient} />
      <hemisphereLight ref={hemi} args={[DAY.hemiSky, DAY.hemiGround, DAY.hemiIntensity]} />
      <directionalLight
        ref={sun}
        intensity={DAY.sunIntensity}
        color={DAY.sun}
        castShadow={!lowPower}
        shadow-mapSize={lowPower ? [1024, 1024] : [2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={190}
        shadow-camera-left={-46}
        shadow-camera-right={46}
        shadow-camera-top={46}
        shadow-camera-bottom={-46}
        shadow-bias={-0.0012}
        shadow-normalBias={0.03}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Director — turns store decisions into actual flying                 */
/* ------------------------------------------------------------------ */

function Director() {
  const phase = useGame((s) => s.phase);
  const warping = useGame((s) => s.warping);
  const destination = useGame((s) => s.destination);
  const muted = useGame((s) => s.muted);
  const launched = useRef(false);

  // Keyboard is live for the whole session.
  useEffect(() => attachInput(), []);

  // Leaving the ground.
  useEffect(() => {
    if (phase === "flying") {
      if (!launched.current) {
        launched.current = true;
        beginTakeoff();
        if (!muted) {
          sfx("power");
          duckMusic(0.45, 2.5);
          setTimeout(() => sfx("whoosh"), 950);
        }
      }
    } else {
      launched.current = false;
    }
  }, [phase, muted]);

  // A warp was requested — fold away and reassemble at the destination.
  useEffect(() => {
    if (!warping) return;
    beginWarp(warping);
    if (!muted) {
      sfx("whoosh");
      duckMusic(0.4, 1.8);
    }
  }, [warping, muted]);

  useEffect(() => {
    if (phase === "complete") {
      flight.mode = "finale";
      if (!muted) sfx("stamp");
    }
  }, [phase, muted]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function Scene() {
  const setLowPower = useGame((s) => s.setLowPower);

  return (
    <>
      <Rig />
      <Director />
      <Lighting />

      <SkyDome />
      <Weather />
      <Life />
      <Collectibles />

      <HomeAirport />
      <ObjectiveIsland />
      <SkillsLab />
      <ExperienceCity />
      <ProjectKingdom />
      <AchievementMuseum />
      <ContactAirport />

      <Airplane />

      <PerformanceMonitor
        bounds={() => [50, 60]}
        // Three consecutive bad samples, not one — a single GC pause during
        // the opening shot should not permanently downgrade the world.
        onDecline={() => setLowPower(true)}
        flipflops={3}
      />
      <AdaptiveDpr pixelated={false} />
      <Preload all />
    </>
  );
}

/* ------------------------------------------------------------------ */

export function Experience() {
  const reducedMotion = useGame((s) => s.reducedMotion);
  const [dpr, setDpr] = useState<[number, number]>([1, 2]);

  useEffect(() => {
    // A phone with a 3x screen does not need 3x of this.
    setDpr(window.innerWidth < 900 ? [1, 1.5] : [1, 2]);
  }, []);

  return (
    <Canvas
      dpr={dpr}
      shadows
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
        depth: true,
      }}
      camera={{ fov: 44, near: 0.5, far: 900, position: [0, 14, 30] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.background = null;
        resetFlight();
      }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
