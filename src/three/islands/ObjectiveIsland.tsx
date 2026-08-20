"use client";

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import { G, PALETTE, mat, mergeParts, type Part } from "../shared";
import { windMaterial } from "../world/wind";
import { Island } from "../world/Island";
import { Flowers, GrassField, River, Trees, Waterfall, type TreeKind } from "../props/Nature";
import { Flock } from "../world/Flock";
import { ISLAND_MAP } from "@/data/world";
import { useGame } from "@/lib/store";
import { profile } from "@/data/resume";
import { Spring, easeOutBack, hash } from "@/lib/math";
import { sfx } from "@/lib/audio";

/**
 * Objective Island — miniature forest, and the mission board.
 *
 * The board is the island's whole reason for existing: it stays folded flat
 * until the wheels are down, then opens like a map being unfolded on a
 * table, and the briefing writes itself on.
 */

const def = ISLAND_MAP.objective;

/* ------------------------------------------------------------------ */

function Windmill({
  position,
  scale = 1,
  speed = 1,
}: {
  position: [number, number, number];
  scale?: number;
  speed?: number;
}) {
  const sails = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (sails.current) sails.current.rotation.z += dt * 0.55 * speed;
  });
  return (
    <group position={position} scale={scale}>
      {/* tower */}
      <mesh geometry={G.taper} material={mat("#EFE3CE", { roughness: 0.9 })} position={[0, 1.7, 0]}
        scale={[1.15, 3.4, 1.15]} castShadow receiveShadow />
      {/* timber banding */}
      {[0.7, 1.7, 2.7].map((y) => (
        <mesh key={y} geometry={G.cyl} material={mat(PALETTE.woodDark, { roughness: 0.9 })}
          position={[0, y, 0]} scale={[1.02 - y * 0.06, 0.08, 1.02 - y * 0.06]} />
      ))}
      {/* cap */}
      <mesh geometry={G.cone} material={mat("#C05C4A", { roughness: 0.82 })} position={[0, 3.9, 0]}
        scale={[1.15, 1.1, 1.15]} castShadow />
      {/* door + window */}
      <mesh geometry={G.box} material={mat(PALETTE.woodDark)} position={[0, 0.55, 0.98]}
        scale={[0.5, 1.1, 0.06]} />
      <mesh geometry={G.box} material={mat("#8FD3E8", { roughness: 0.2 })} position={[0, 2.2, 0.86]}
        scale={[0.34, 0.34, 0.06]} />

      <group ref={sails} position={[0, 3.1, 1.0]}>
        <mesh geometry={G.cylLo} material={mat(PALETTE.woodDark)} rotation={[Math.PI / 2, 0, 0]}
          scale={[0.14, 0.3, 0.14]} />
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i / 4) * Math.PI * 2]}>
            <mesh geometry={G.box} material={mat(PALETTE.wood, { roughness: 0.85 })}
              position={[0, 1.25, 0]} scale={[0.1, 2.5, 0.08]} castShadow />
            <mesh material={windMaterial("#FFF8EC", { amp: 0.05, heightScale: 0.5, side: THREE.DoubleSide })}
              position={[0.3, 1.25, 0.04]}>
              <planeGeometry args={[0.55, 2.2, 2, 6]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A wooden bridge — planks, posts and rails baked into a single geometry.
 *
 * Nothing about a bridge moves, so there is no reason for it to be
 * twenty-six separate meshes. Merging drops each one to a single draw call
 * and the alternating plank colours survive as vertex colours.
 */
function Bridge({
  from,
  to,
  width = 1.8,
}: {
  from: [number, number, number];
  to: [number, number, number];
  width?: number;
}) {
  const { geo, mid, angle } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const m = a.clone().lerp(b, 0.5);
    const len = a.distanceTo(b);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    const planks = Math.max(4, Math.round(len / 0.42));
    const parts: Part[] = [];

    for (let i = 0; i < planks; i++) {
      const t = i / (planks - 1);
      // A shallow arch — a flat bridge reads as a plank, not a bridge.
      parts.push({
        geo: G.box,
        color: i % 2 ? PALETTE.wood : "#B07C46",
        position: [0, Math.sin(t * Math.PI) * 0.34, -len / 2 + t * len],
        rotation: [Math.cos(t * Math.PI) * 0.22, 0, 0],
        scale: [width, 0.09, 0.32],
      });
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        parts.push({
          geo: G.cylLo,
          color: PALETTE.woodDark,
          position: [(s * width) / 2, Math.sin(t * Math.PI) * 0.34 + 0.34, -len / 2 + t * len],
          scale: [0.05, 0.68, 0.05],
        });
      }
      parts.push({
        geo: G.box,
        color: "#B98A55",
        position: [(s * width) / 2, 0.75, 0],
        scale: [0.06, 0.06, len * 0.98],
      });
    }
    return { geo: mergeParts(parts), mid: m, angle: ang };
  }, [from, to, width]);

  const material = useMemo(() => mat("#FFFFFF", { roughness: 0.9, vertexColors: true }), []);

  return (
    <mesh
      geometry={geo}
      material={material}
      position={[mid.x, mid.y, mid.z]}
      rotation={[0, angle, 0]}
      castShadow
      receiveShadow
    />
  );
}

/* ------------------------------------------------------------------ */
/* The mission board                                                   */
/* ------------------------------------------------------------------ */

/**
 * The board face is drawn to a canvas rather than composed from DOM.
 *
 * A drei <Html> board is a projected DOM element: its on-screen size depends
 * on camera distance, so text that reads at one orbit position is unreadable
 * at another. A CanvasTexture is fixed in world units — 7.4m of board is
 * always 7.4m of board — which is the only way to promise this stays legible
 * at every screen size and camera angle.
 */
const BOARD_W = 1280;
const BOARD_H = 800;

function drawBoard(ctx: CanvasRenderingContext2D, revealed: number) {
  const headline = `Explore ${profile.fullName}'s engineering journey`;
  const lines = profile.missionBriefing;

  ctx.clearRect(0, 0, BOARD_W, BOARD_H);

  // Cream board with a faint paper grain.
  ctx.fillStyle = "#FFFBF0";
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.fillStyle = "rgba(120, 96, 64, 0.045)";
  for (let y = 0; y < BOARD_H; y += 6) ctx.fillRect(0, y, BOARD_W, 2);

  // Inner rule.
  ctx.strokeStyle = "rgba(74, 63, 53, 0.28)";
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 34, BOARD_W - 68, BOARD_H - 68);

  // Stamp.
  ctx.save();
  ctx.translate(96, 108);
  ctx.rotate(-0.05);
  ctx.strokeStyle = "#C0392B";
  ctx.lineWidth = 6;
  ctx.strokeRect(-8, -34, 300, 62);
  ctx.fillStyle = "#C0392B";
  ctx.font = "700 40px Fredoka, Trebuchet MS, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("MISSION BRIEF", 8, 0);
  ctx.restore();

  // Headline — wrapped, large, near-black on cream for maximum contrast.
  ctx.fillStyle = "#2A241D";
  ctx.font = "600 62px Fredoka, Trebuchet MS, sans-serif";
  ctx.textBaseline = "top";
  const maxW = BOARD_W - 160;
  let y = 190;
  let line = "";
  for (const word of headline.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, 80, y);
      y += 74;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, 80, y);
  y += 104;

  // Divider.
  ctx.fillStyle = "#E8553F";
  ctx.fillRect(80, y - 30, 150, 8);

  // Briefing lines, typed in one character at a time.
  const joined = lines.join("\n");
  const shown = joined.slice(0, Math.floor(revealed * joined.length));
  ctx.font = "400 42px Nunito, system-ui, sans-serif";
  ctx.fillStyle = "#4A4038";
  for (const raw of shown.split("\n")) {
    ctx.fillStyle = "#E8553F";
    ctx.fillRect(84, y + 18, 14, 14);
    ctx.fillStyle = "#4A4038";
    // Each briefing line is short enough not to need wrapping, but clamp
    // anyway so a future edit can never overflow the board.
    let l = "";
    let ly = y;
    for (const word of raw.split(" ")) {
      const test = l ? `${l} ${word}` : word;
      if (ctx.measureText(test).width > maxW - 60 && l) {
        ctx.fillText(l, 124, ly);
        ly += 52;
        l = word;
      } else {
        l = test;
      }
    }
    if (l) ctx.fillText(l, 124, ly);
    y = ly + 72;
  }

  // Signature.
  ctx.fillStyle = "rgba(74, 63, 53, 0.55)";
  ctx.font = "400 40px Caveat, cursive";
  ctx.textAlign = "right";
  ctx.fillText(`— ${profile.callsign}`, BOARD_W - 90, BOARD_H - 110);
  ctx.textAlign = "left";
}

function MissionBoard() {
  const current = useGame((s) => s.current);
  const muted = useGame((s) => s.muted);
  const panelOpen = useGame((s) => s.panelOpen);
  const openPanel = useGame((s) => s.openPanel);
  const closePanel = useGame((s) => s.closePanel);
  const open = current === "objective";
  const parked = open;
  const hovered = useRef(false);
  const [showTag, setShowTag] = useState(false);
  const lift = useMemo(() => new Spring(0, 9, 0.5), []);

  const leftLeaf = useRef<THREE.Group>(null);
  const rightLeaf = useRef<THREE.Group>(null);
  const sheet = useRef<THREE.Group>(null);
  const springs = useMemo(
    () => ({ fold: new Spring(0, 7, 0.62), rise: new Spring(0, 6, 0.55) }),
    []
  );
  const announced = useRef(false);
  const typed = useRef(0);
  const lastDrawn = useRef(-1);

  const { texture, ctx } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = BOARD_W;
    c.height = BOARD_H;
    const context = c.getContext("2d")!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { texture: tex, ctx: context };
  }, []);

  const faceMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.94 }),
    [texture]
  );

  useFrame((_, dt) => {
    springs.rise.step(open ? 1 : 0, dt);
    // The fold trails the rise, so the board lifts *then* opens.
    springs.fold.step(springs.rise.value > 0.55 ? 1 : 0, dt);
    const f = springs.fold.value;
    const r = springs.rise.value;

    if (sheet.current) {
      sheet.current.scale.setScalar(0.4 + r * 0.6);
      sheet.current.position.y = 3.1 + r * 0.55;
      sheet.current.rotation.x = (1 - r) * -0.8;
    }
    if (leftLeaf.current) leftLeaf.current.rotation.y = (1 - f) * 2.1;
    if (rightLeaf.current) rightLeaf.current.rotation.y = -(1 - f) * 2.1;

    // Type the briefing once the board is open; rewind when it closes.
    typed.current = THREE.MathUtils.clamp(
      typed.current + (f > 0.75 ? dt * 0.55 : -dt * 2),
      0,
      1
    );
    // Only repaint when a new character has actually appeared.
    const step = Math.round(typed.current * 90);
    if (step !== lastDrawn.current) {
      lastDrawn.current = step;
      drawBoard(ctx, typed.current);
      texture.needsUpdate = true;
    }

    // Hover lift, so the board answers the cursor the way buildings do.
    const h = lift.step(hovered.current && parked ? 1 : 0, dt);
    if (sheet.current) {
      sheet.current.position.y += h * 0.16;
      sheet.current.scale.multiplyScalar(1 + h * 0.02);
    }

    if (open && !announced.current && f > 0.3) {
      announced.current = true;
      if (!muted) sfx("unfold");
    }
    if (!open) announced.current = false;
  });

  const wood = mat(PALETTE.woodDark, { roughness: 0.86 });
  const board = mat("#F6EEDD", { roughness: 0.94, side: THREE.DoubleSide });

  return (
    <group position={[0, 0, -5.4]} rotation={[0, 0.08, 0]}>
      {/* easel legs + tray */}
      {[-3.6, 3.6].map((x) => (
        <mesh key={x} geometry={G.cylLo} material={wood} position={[x, 1.5, 0.1]}
          rotation={[0.12, 0, x > 0 ? -0.05 : 0.05]} scale={[0.18, 3, 0.18]} castShadow />
      ))}
      <mesh geometry={G.box} material={mat(PALETTE.wood, { roughness: 0.86 })}
        position={[0, 2.95, 0.12]} scale={[7.9, 0.22, 0.3]} castShadow />

      <group ref={sheet} position={[0, 3.1, 0.2]}>
        {/* the readable face */}
        <mesh geometry={G.box} material={faceMat} scale={[7.4, 4.6, 0.12]} castShadow />
        {/* chunky wooden frame around it */}
        {([[0, 2.42, 7.9, 0.34], [0, -2.42, 7.9, 0.34]] as const).map(([x, y, w, h], i) => (
          <mesh key={`h${i}`} geometry={G.box} material={wood} position={[x, y, 0]}
            scale={[w, h, 0.2]} castShadow />
        ))}
        {([-3.87, 3.87] as const).map((x) => (
          <mesh key={x} geometry={G.box} material={wood} position={[x, 0, 0]} scale={[0.34, 5.18, 0.2]}
            castShadow />
        ))}

        {/* side leaves that swing open to reveal the face */}
        <group ref={leftLeaf} position={[-3.7, 0, 0.1]}>
          <mesh geometry={G.box} material={board} position={[-1.85, 0, 0]} scale={[3.7, 4.6, 0.1]}
            castShadow />
        </group>
        <group ref={rightLeaf} position={[3.7, 0, 0.1]}>
          <mesh geometry={G.box} material={board} position={[1.85, 0, 0]} scale={[3.7, 4.6, 0.1]}
            castShadow />
        </group>
      </group>

      {/* The board is the section, so it opens the same right-hand panel
          every other island opens. Without this it was the one piece of
          content in the world you could not click. */}
      <mesh
        position={[0, 3.4, 0.6]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          if (!parked) return;
          if (panelOpen) closePanel();
          else openPanel();
          if (!muted) sfx(panelOpen ? "click" : "unfold");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!parked) return;
          hovered.current = true;
          setShowTag(true);
          document.body.style.cursor = "pointer";
          if (!muted) sfx("hover");
        }}
        onPointerOut={() => {
          hovered.current = false;
          setShowTag(false);
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[8.6, 6.2, 2.6]} />
      </mesh>

      {(showTag || (parked && !panelOpen)) && (
        <Html center distanceFactor={28} position={[0, 6.9, 0.4]} zIndexRange={[16, 0]}
          className="pointer-events-none">
          <span className="building-tag" data-open={panelOpen}
            style={{ ["--c" as string]: def.accent }}>
            <strong>Mission Brief</strong>
            <em>{panelOpen ? "Open" : "Read it"}</em>
          </span>
        </Html>
      )}

      {/* The sun rides with the aeroplane, so whether this board is lit
          depends on where you happen to be — and a briefing you cannot read
          is not a briefing. These fills guarantee the board stays legible. */}
      <pointLight position={[0, 4.4, 5]} color="#FFF4E0" intensity={22} distance={16} decay={2} />
      <pointLight position={[-4, 2.5, 4]} color="#FFE9C8" intensity={8} distance={12} decay={2} />
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function ObjectiveIsland() {
  const R = def.radius;

  const forest = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const a = hash(i * 2.3) * Math.PI * 2;
        const r = 6.5 + hash(i * 4.9) * (R - 8.5);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        return {
          position: [x, 0, z] as [number, number, number],
          scale: 0.75 + hash(i * 6.1) * 0.75,
          kind: (hash(i * 8.3) > 0.55 ? "pine" : "round") as TreeKind,
        };
      }).filter(({ position }) => Math.hypot(position[0] - def.pad.x, position[2] - def.pad.z) > 5.5),
    [R]
  );

  return (
    <Island def={def}>
      <GrassField radius={R - 1.4} count={760} color="#5FBE72" seed={11} exclude={4.4} />
      <Flowers radius={R - 2.2} count={130} seed={12} exclude={4.8}
        colors={["#FF8FA3", "#FFD166", "#C4A0FF", "#FFFFFF", "#7FE3B0"]} />

      <Trees items={forest} leaf="#4FB865" leafDark="#2F8B4C" />

      {/* a stream running from the windmill to the cliff edge */}
      <River
        points={[
          [-11, -6],
          [-7, -2.4],
          [-4.6, 2],
          [-6.2, 7],
          [-8.5, 12],
        ]}
        width={1.7}
      />
      <Waterfall position={[-8.8, -0.5, 13.2]} width={2.4} height={15} rotation={0.35} />

      <Bridge from={[-2.5, 0.16, 1.6]} to={[-7.2, 0.16, 3.2]} width={1.7} />
      <Bridge from={[-6.4, 0.16, -3.6]} to={[-9.6, 0.16, -6.6]} width={1.4} />

      <Windmill position={[-11.5, 0, -8.5]} scale={1.15} />
      <Windmill position={[9.5, 0, -9.5]} scale={0.78} speed={1.4} />

      <MissionBoard />

      {/* signpost pointing the way onward */}
      <group position={[5.6, 0, 5.4]} rotation={[0, -0.6, 0]}>
        <mesh geometry={G.cylLo} material={mat(PALETTE.woodDark)} position={[0, 1.1, 0]}
          scale={[0.1, 2.2, 0.1]} castShadow />
        {[
          { y: 1.85, dir: 1, color: "#7FE3F0" },
          { y: 1.42, dir: -1, color: "#FF9E7A" },
          { y: 0.99, dir: 1, color: "#FFB24D" },
        ].map(({ y, dir, color }) => (
          <group key={y} position={[dir * 0.62, y, 0]}>
            <mesh geometry={G.box} material={mat(color, { roughness: 0.8 })} scale={[1.3, 0.28, 0.07]}
              castShadow />
            <mesh geometry={G.cone} material={mat(color, { roughness: 0.8 })}
              position={[dir * 0.78, 0, 0]} rotation={[0, 0, dir * -Math.PI / 2]}
              scale={[0.18, 0.28, 0.07]} />
          </group>
        ))}
      </group>

      <Flock count={22} kind="butterfly" center={[2, 2.2, 4]} radius={9} vertical={1.8} speed={0.42}
        scale={0.62} color="#FFD166" colorB="#FF8FA3" />
      <Flock count={14} kind="butterfly" center={[-8, 2.6, -4]} radius={6} vertical={1.5} speed={0.55}
        scale={0.5} color="#9AD8FF" colorB="#C4A0FF" />
    </Island>
  );
}
