"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { G, PALETTE, mat, mergeParts, type Part } from "../shared";
import { windMaterial } from "../world/wind";
import { discPoint, hash } from "@/lib/math";
import { Puffs, type PuffHandle } from "../effects/Puffs";

/**
 * Ground cover, trees, water.
 *
 * Anything that appears more than a dozen times is an InstancedMesh with a
 * deterministic layout — same seed, same island, every reload. That
 * determinism matters: a world that rearranges itself between visits stops
 * feeling like a place.
 */

/* ------------------------------------------------------------------ */
/* TREES                                                               */
/* ------------------------------------------------------------------ */

export type TreeKind = "pine" | "round" | "palm";

/* --- instanced trees ------------------------------------------------
 *
 * A tree used to be four to seven separate meshes, and the world plants
 * about seventy of them — roughly 350 draw calls for scenery you fly past.
 *
 * Each kind is now baked into ONE geometry with its trunk/leaf/shade colours
 * written into vertex colours, then instanced. A whole forest is a single
 * draw call. The wind shader still works unchanged: it keys off local Y, and
 * the merged trunk still sits at y=0, so the base stays planted and only the
 * canopy sways.
 */

// Deliberately low-poly source primitives: at instance scale these are
// thumb-sized, and the vertex count is multiplied by every tree in the world.
const T_TRUNK = new THREE.CylinderGeometry(0.7, 1, 1, 7);
const T_BALL = new THREE.SphereGeometry(1, 9, 6);
const T_CONE = new THREE.ConeGeometry(1, 1, 7);

const treeGeoCache = new Map<string, THREE.BufferGeometry>();

function treeGeometry(kind: TreeKind, leaf: string, leafDark: string) {
  const key = `${kind}|${leaf}|${leafDark}`;
  const hit = treeGeoCache.get(key);
  if (hit) return hit;

  const bark = PALETTE.woodDark;
  let parts: Part[];

  if (kind === "pine") {
    parts = [
      { geo: T_TRUNK, color: bark, position: [0, 0.5, 0], scale: [0.16, 1, 0.16] },
      ...[0, 1, 2].map((i) => ({
        geo: T_CONE,
        color: i % 2 ? leafDark : leaf,
        position: [0, 1.1 + i * 0.72, 0] as [number, number, number],
        scale: [1.15 - i * 0.26, 1.15 - i * 0.2, 1.15 - i * 0.26] as [number, number, number],
      })),
    ];
  } else if (kind === "palm") {
    parts = [
      { geo: T_TRUNK, color: bark, position: [0, 1.1, 0], rotation: [0, 0, 0.12], scale: [0.13, 2.2, 0.13] },
      ...Array.from({ length: 6 }, (_, i) => ({
        geo: T_CONE,
        color: i % 2 ? leafDark : leaf,
        position: [
          Math.cos((i / 6) * Math.PI * 2) * 0.55,
          2.2,
          Math.sin((i / 6) * Math.PI * 2) * 0.55,
        ] as [number, number, number],
        rotation: [Math.PI / 2.4, (i / 6) * Math.PI * 2, 0] as [number, number, number],
        scale: [0.28, 1.3, 0.28] as [number, number, number],
      })),
    ];
  } else {
    parts = [
      { geo: T_TRUNK, color: bark, position: [0, 0.6, 0], scale: [0.15, 1.2, 0.15] },
      { geo: T_BALL, color: leaf, position: [0, 1.75, 0], scale: [0.95, 0.85, 0.95] },
      { geo: T_BALL, color: leafDark, position: [0.45, 1.5, 0.2], scale: 0.6 },
      { geo: T_BALL, color: leaf, position: [-0.42, 1.42, -0.24], scale: 0.55 },
      { geo: T_BALL, color: leafDark, position: [0.05, 2.2, -0.3], scale: 0.46 },
    ];
  }

  const g = mergeParts(parts);
  treeGeoCache.set(key, g);
  return g;
}

export type TreeItem = {
  position: [number, number, number];
  scale?: number;
  kind?: TreeKind;
  /** Y rotation; randomised from the index when omitted. */
  rotation?: number;
};

/** Plants a whole forest in one draw call per tree kind. */
export function Trees({
  items,
  leaf = PALETTE.leaf,
  leafDark = PALETTE.leafDark,
}: {
  items: TreeItem[];
  leaf?: string;
  leafDark?: string;
}) {
  const groups = useMemo(() => {
    const byKind = new Map<TreeKind, TreeItem[]>();
    for (const it of items) {
      const k = it.kind ?? "round";
      const list = byKind.get(k);
      if (list) list.push(it);
      else byKind.set(k, [it]);
    }
    return [...byKind.entries()];
  }, [items]);

  return (
    <>
      {groups.map(([kind, list]) => (
        <TreeBatch key={kind} kind={kind} items={list} leaf={leaf} leafDark={leafDark} />
      ))}
    </>
  );
}

function TreeBatch({
  kind,
  items,
  leaf,
  leafDark,
}: {
  kind: TreeKind;
  items: TreeItem[];
  leaf: string;
  leafDark: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => treeGeometry(kind, leaf, leafDark), [kind, leaf, leafDark]);
  const material = useMemo(
    () =>
      windMaterial("#FFFFFF", {
        amp: 0.16,
        heightScale: 0.32,
        flat: true,
        roughness: 0.86,
        // White base colour so the baked vertex colours pass through unchanged.
        vertexColors: true,
      }),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((it, i) => {
      dummy.position.set(...it.position);
      dummy.rotation.set(0, it.rotation ?? hash(i * 4.7 + it.position[0]) * Math.PI * 2, 0);
      dummy.scale.setScalar(it.scale ?? 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items, dummy]);

  return (
    <instancedMesh ref={ref} args={[geo, material, items.length]} castShadow receiveShadow />
  );
}

/* --- single tree (kept for one-off placements) ---------------------- */

export function Tree({
  position,
  scale = 1,
  kind = "round",
  leaf = PALETTE.leaf,
  leafDark = PALETTE.leafDark,
}: {
  position: [number, number, number];
  scale?: number;
  kind?: TreeKind;
  leaf?: string;
  leafDark?: string;
}) {
  const trunk = mat(PALETTE.woodDark, { roughness: 0.9 });
  // heightScale is 1/height so the wind chunk's `h` normalises correctly.
  const canopy = windMaterial(leaf, { amp: 0.16, heightScale: 0.28, flat: true });
  const canopyDark = windMaterial(leafDark, { amp: 0.16, heightScale: 0.28, flat: true });

  if (kind === "pine") {
    return (
      <group position={position} scale={scale}>
        <mesh geometry={G.taper} material={trunk} position={[0, 0.5, 0]} scale={[0.16, 1, 0.16]}
          castShadow />
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={G.cone} material={i % 2 ? canopyDark : canopy}
            position={[0, 1.1 + i * 0.72, 0]} scale={[1.15 - i * 0.26, 1.15 - i * 0.2, 1.15 - i * 0.26]}
            castShadow />
        ))}
      </group>
    );
  }

  if (kind === "palm") {
    return (
      <group position={position} scale={scale}>
        <mesh geometry={G.taper} material={trunk} position={[0, 1.1, 0]} rotation={[0, 0, 0.12]}
          scale={[0.13, 2.2, 0.13]} castShadow />
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} geometry={G.cone} material={i % 2 ? canopyDark : canopy}
            position={[
              Math.cos((i / 6) * Math.PI * 2) * 0.55,
              2.2,
              Math.sin((i / 6) * Math.PI * 2) * 0.55,
            ]}
            rotation={[Math.PI / 2.4, (i / 6) * Math.PI * 2, 0]}
            scale={[0.28, 1.3, 0.28]} castShadow />
        ))}
      </group>
    );
  }

  return (
    <group position={position} scale={scale}>
      <mesh geometry={G.taper} material={trunk} position={[0, 0.6, 0]} scale={[0.15, 1.2, 0.15]}
        castShadow />
      {/* A cluster reads as a canopy far better than a single sphere. */}
      <mesh geometry={G.sphere} material={canopy} position={[0, 1.75, 0]} scale={[0.95, 0.85, 0.95]}
        castShadow />
      <mesh geometry={G.sphere} material={canopyDark} position={[0.45, 1.5, 0.2]} scale={0.6}
        castShadow />
      <mesh geometry={G.sphere} material={canopy} position={[-0.42, 1.42, -0.24]} scale={0.55}
        castShadow />
      <mesh geometry={G.sphere} material={canopyDark} position={[0.05, 2.2, -0.3]} scale={0.46} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* GRASS + FLOWERS — instanced ground cover                            */
/* ------------------------------------------------------------------ */

const BLADE = new THREE.ConeGeometry(0.055, 0.42, 3);
BLADE.translate(0, 0.21, 0);

export function GrassField({
  radius,
  count = 500,
  y = 0,
  color = "#63BE72",
  seed = 1,
  exclude = 0,
}: {
  radius: number;
  count?: number;
  y?: number;
  color?: string;
  seed?: number;
  /** Keep an inner circle clear — the landing pad lives there. */
  exclude?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(
    () => windMaterial(color, { amp: 0.16, heightScale: 2.4, flat: true, roughness: 0.9 }),
    [color]
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const [dx, dz] = discPoint(i + seed * 1000, seed);
      const x = dx * radius;
      const z = dz * radius;
      if (Math.hypot(x, z) < exclude) continue;
      const s = 0.6 + hash(i * 5.1 + seed) * 0.9;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, hash(i * 3.3 + seed) * Math.PI, 0);
      dummy.scale.set(s, s * (0.7 + hash(i * 7.7) * 0.8), s);
      dummy.updateMatrix();
      m.setMatrixAt(n++, dummy.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [radius, count, y, seed, exclude, dummy]);

  return (
    <instancedMesh ref={ref} args={[BLADE, material, count]} receiveShadow frustumCulled />
  );
}

const PETAL = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 6);
PETAL.translate(0, 0.3, 0);
const STEM = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4);
STEM.translate(0, 0.15, 0);
const FLOWER = (() => {
  // Merge stem + head once so each flower is a single instance.
  const g = new THREE.BufferGeometry();
  const stemPos = STEM.attributes.position.array as Float32Array;
  const petalPos = PETAL.attributes.position.array as Float32Array;
  const stemIdx = Array.from(STEM.index!.array);
  const petalIdx = Array.from(PETAL.index!.array).map((i) => i + stemPos.length / 3);
  const pos = new Float32Array(stemPos.length + petalPos.length);
  pos.set(stemPos, 0);
  pos.set(petalPos, stemPos.length);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const nStem = STEM.attributes.normal.array as Float32Array;
  const nPetal = PETAL.attributes.normal.array as Float32Array;
  const nrm = new Float32Array(nStem.length + nPetal.length);
  nrm.set(nStem, 0);
  nrm.set(nPetal, nStem.length);
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setIndex([...stemIdx, ...petalIdx]);
  return g;
})();

export function Flowers({
  radius,
  count = 90,
  y = 0,
  colors = ["#FF8FA3", "#FFD166", "#C4A0FF", "#FFFFFF"],
  seed = 7,
  exclude = 0,
}: {
  radius: number;
  count?: number;
  y?: number;
  colors?: string[];
  seed?: number;
  exclude?: number;
}) {
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const groups = useMemo(() => {
    // One instanced mesh per colour: still only four draw calls.
    return colors.map((c, ci) => {
      const items: THREE.Matrix4[] = [];
      for (let i = ci; i < count; i += colors.length) {
        const [dx, dz] = discPoint(i + seed * 500, seed + 3);
        const x = dx * radius;
        const z = dz * radius;
        if (Math.hypot(x, z) < exclude) continue;
        const s = 0.7 + hash(i * 2.7 + seed) * 0.6;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, hash(i * 4.1) * Math.PI, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        items.push(dummy.matrix.clone());
      }
      return { color: c, items };
    });
  }, [colors, count, radius, y, seed, exclude, dummy]);

  return (
    <>
      {groups.map(({ color, items }) => (
        <FlowerBatch key={color} color={color} matrices={items} />
      ))}
    </>
  );
}

function FlowerBatch({ color, matrices }: { color: string; matrices: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(
    () => windMaterial(color, { amp: 0.1, heightScale: 3, roughness: 0.85 }),
    [color]
  );
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((mat4, i) => m.setMatrixAt(i, mat4));
    m.count = matrices.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  if (!matrices.length) return null;
  return <instancedMesh ref={ref} args={[FLOWER, material, matrices.length]} castShadow />;
}

/* ------------------------------------------------------------------ */
/* WATER                                                               */
/* ------------------------------------------------------------------ */

const WATER_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;
  void main() {
    vUv = uv;
    vec3 p = position;
    float w = sin(p.x * 1.6 + uTime * 1.6) * 0.5 + sin(p.y * 2.1 - uTime * 1.1) * 0.5;
    p.z += w * 0.06;
    vWave = w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uFoam;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vWave;
  void main() {
    // Ripple bands drifting across the surface.
    float r = sin(vUv.y * 26.0 - uTime * 2.4) * 0.5 + 0.5;
    float sparkle = smoothstep(0.86, 1.0, r) * 0.5;
    vec3 col = mix(uColor, uFoam, sparkle + vWave * 0.12 + 0.1);
    // Foam where the water meets the bank.
    float edge = smoothstep(0.5, 0.0, abs(vUv.x - 0.5) * 2.0);
    col = mix(uFoam, col, smoothstep(0.0, 0.22, edge));
    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

export function useWaterMaterial(
  color: string = PALETTE.water,
  foam = "#EAFBFF",
  opacity = 0.88
) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        transparent: opacity < 1,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uFoam: { value: new THREE.Color(foam) },
          uOpacity: { value: opacity },
        },
      }),
    [color, foam, opacity]
  );
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  return material;
}

/** A river winding across an island top. */
export function River({
  points,
  width = 1.6,
  y = 0.03,
}: {
  points: [number, number][];
  width?: number;
  y?: number;
}) {
  const material = useWaterMaterial();
  const geom = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      "centripetal"
    );
    const N = 60;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(width / 2);
      pos.push(p.x - side.x, 0, p.z - side.z, p.x + side.x, 0, p.z + side.z);
      uv.push(0, t * 6, 1, t * 6);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [points, width]);

  return <mesh geometry={geom} material={material} position={[0, y, 0]} rotation={[0, 0, 0]} />;
}

/** Water pouring off an island edge into open sky, with spray at the lip. */
export function Waterfall({
  position,
  width = 3,
  height = 14,
  rotation = 0,
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
  rotation?: number;
}) {
  const material = useWaterMaterial("#7FD6F0", "#FFFFFF", 0.78);
  const spray = useRef<PuffHandle>(null);
  const acc = useRef(0);

  useFrame((_, dt) => {
    acc.current += dt;
    // Spray at the lip, not the (nonexistent) bottom — this water falls
    // into open sky, which is the whole charm of a floating island.
    while (acc.current > 0.07) {
      acc.current -= 0.07;
      spray.current?.spawn(
        position[0] + (Math.random() - 0.5) * width,
        position[1] - 0.4,
        position[2] + (Math.random() - 0.5) * 0.6,
        { scale: 0.75, life: 1.7, vy: -1.6, spread: 0.4 }
      );
    }
  });

  return (
    <group>
      <group position={position} rotation={[0, rotation, 0]}>
        <mesh material={material} position={[0, -height / 2, 0]}>
          <planeGeometry args={[width, height, 6, 20]} />
        </mesh>
        {/* the lip: a rounded lozenge of white water */}
        <mesh geometry={G.cyl} material={mat("#EAFBFF", { roughness: 0.2 })} position={[0, 0.04, 0]}
          rotation={[0, 0, Math.PI / 2]} scale={[0.22, width, 0.22]} />
      </group>
      <Puffs ref={spray} count={70} color="#EAFBFF" gravity={-2.2} growth={2.6} opacity={0.4}
        size={13} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* ROCKS                                                               */
/* ------------------------------------------------------------------ */

const ROCK = new THREE.DodecahedronGeometry(1, 0);

export function Rocks({
  radius,
  count = 12,
  y = 0,
  color = "#8C8896",
  seed = 3,
}: {
  radius: number;
  count?: number;
  y?: number;
  color?: string;
  seed?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => mat(color, { flat: true, roughness: 0.94 }), [color]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < count; i++) {
      const [dx, dz] = discPoint(i + seed * 300, seed + 11);
      const s = 0.25 + hash(i * 6.3 + seed) * 0.5;
      dummy.position.set(dx * radius, y + s * 0.3, dz * radius);
      dummy.rotation.set(hash(i) * 3, hash(i * 2) * 3, hash(i * 3) * 3);
      dummy.scale.set(s, s * 0.75, s * 1.1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [radius, count, y, seed, dummy]);

  return <instancedMesh ref={ref} args={[ROCK, material, count]} castShadow receiveShadow />;
}
