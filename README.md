# Captain user

An interactive portfolio for **Balamurugane R**, Full-Stack Developer — one you
fly rather than scroll.

The visitor pilots a toy aeroplane around a miniature archipelago. Seven
floating islands hold the résumé content, and there is no scrolling, no menu
and no page navigation anywhere in the experience.

```
🏠 Home Airport → 🎯 Objective Island → ⚙️ Skills Lab → 🏢 Experience City
   → 🏗️ Project Kingdom → 🏆 Achievement Museum → 📬 Contact Airport → 🎉 Mission Complete
```

**Controls** — `↑` throttle · `↓` brake · `←` `→` turn (WASD also works).
Fly over a glowing landing pad to touch down. On touch devices there is an
on-screen stick and throttle. Selecting a destination instead performs a warp:
the aeroplane folds away and reassembles there.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

Node 18.18+. No API keys, no environment variables, no external services.

## Deploying to GitHub Pages

The site is fully static — no API routes, no server actions, no image
optimisation — so it exports to flat files and hosts free on Pages.

Push to `main`; `.github/workflows/deploy.yml` does the rest. It works out the
base path itself (a project repo serves from `/<repo-name>`, a
`<user>.github.io` repo from the root) and sets `NEXT_PUBLIC_BASE_PATH`
accordingly, so there is nothing to configure by hand.

One-time setup on GitHub: **Settings → Pages → Source → GitHub Actions**.

The export is opt-in via `NEXT_EXPORT=true`, which only CI sets, so `npm run
dev` and `npm start` behave normally. To reproduce a CI build locally:

```bash
NEXT_EXPORT=true NEXT_PUBLIC_BASE_PATH=/<repo-name> npm run build   # -> out/
```

## Architecture

```
src/
  data/
    resume.ts        Single source of truth. Every string in the world.
    world.ts         Island layout: positions, radii, landing pads, palettes.
  lib/
    flight.ts        Flight model, warp, landing, chase camera, state machine.
    input.ts         Keyboard + on-screen stick, resolved once per frame.
    store.ts         Zustand — discrete game state only, never per-frame values.
    math.ts          Frame-rate-independent damping, springs, easings, noise.
    audio.ts         Every sound, synthesised at runtime. Zero audio files.
  three/
    Experience.tsx   Canvas root, camera rig, adaptive lighting, director.
    Airplane.tsx     The hero. Propeller, nav lights, smoke, landing dust.
    shared.ts        Shared geometry/material caches and geometry merging.
    world/           Sky, weather, wildlife, islands, collectibles, wind.
    islands/         One file per island, each with its own art direction.
    props/, effects/ Instanced nature props and GPU particle systems.
  ui/
    Loader, StartScreen, Hud, Panel, TouchControls, WarpOverlay,
    Toast, MissionComplete, EasterEggs, AccessibleResume
```

### The two rules that shape everything

**1. React owns decisions; the render loop owns motion.**
The store holds discrete state — which island, which panel, day or night.
Anything that changes every frame (plane transform, camera, particles, the
day/night blend, the HUD's speed readout) lives in plain mutable objects
outside React. Pushing sixty transform updates a second through a store would
re-render the tree sixty times a second.

**2. Nothing moves on a fixed alpha.**
All damping is exponential against delta time, so a 144 Hz monitor and a
throttled laptop settle along the identical curve. `Spring` in `math.ts` is a
real critically-damped spring with velocity carry-over, for movements that
need momentum and settling rather than a pure ease.

### Flight

A hand-tuned arcade model, not a simulator. Throttle spools, turns build and
unwind with inertia, and the bank angle follows the *achieved* turn rate
rather than the key being held — so letting go leaves the aeroplane drifting
out of the turn as the wings level themselves.

Altitude is automatic: an inverse-square weighted blend of every island's
deck, which is continuous everywhere and so never produces a sudden climb as
you cross between two of them.

`flight.ts` runs a state machine over one camera — `parked`, `takeoff`,
`free`, `warp`, `landing`, `finale`. In flight the camera's position and its
aim point are damped at *different* rates, which is what makes it swing wide
through a turn and catch up on the exit.

Two curve details worth knowing, both fixes for real bugs:

- The **landing** approach clamps every control point to the distance actually
  remaining. Landing triggers when you fly *over* a pad, so a fixed lead-in
  along the current heading sits past the target and forces the curve to
  overshoot and swing back.
- **Warp** replaced an auto-pilot flight whose first control point extended
  along the plane's current heading — requesting a destination while facing
  away made it genuinely fly away first, then loop back.

### Performance

- **Everything is procedural.** No GLB models, no textures, no audio files.
- Static, repeated geometry is merged into single buffers with per-part
  colours baked into vertex colours (`mergeParts` in `three/shared.ts`), then
  instanced. A forest is one draw call; so is a fence, a bridge, a colonnade.
- Ground cover, clouds, windows and collectibles are `InstancedMesh` with
  deterministic layouts — same seed, same island, every reload.
- Birds and butterflies solve their entire path, heading, banking and wing
  flap in the vertex shader. The CPU writes four uniforms per flock per frame
  regardless of count.
- Particles are a recycled ring buffer feeding one `Points` draw call, with
  buffer uploads batched to once per frame rather than once per spawn.
- Dynamic lights are kept deliberately low: every extra light is a per-fragment
  loop for every lit surface in the world.
- `PerformanceMonitor` + `AdaptiveDpr` degrade detail on sustained frame drops.

Measured with the WebGL draw calls instrumented directly: 1175 → 676 per frame
while parked, 610 → 423 in flight; 33 → 12 point lights, 4 → 1 spotlights.

### Accessibility & SEO

- The full résumé is in the DOM as semantic HTML from the first byte
  (`ui/AccessibleResume.tsx`) — visually hidden, fully in the accessibility
  tree. A WebGL canvas is invisible to a crawler and hostile to a screen
  reader; this is the text layer of the same site, from the same data.
- JSON-LD `Person` structured data, also generated from `resume.ts`.
- In-world markers are real `<button>`s with descriptive labels.
- Live regions announce toasts and mission progress.
- `prefers-reduced-motion` is respected.

### Easter eggs

Click the sun · click a cloud · double-click the aeroplane · collect the ten
stars · rain long enough for a rainbow · Konami code (`↑↑↓↓←→←→ B A`).

## Content

`src/data/resume.ts` is the only place content lives. Edit it and the whole
world updates — island copy, panels, the accessible résumé, the JSON-LD and
the finale. You never need to touch the Three.js code to change what it says.

## Notes on the stack

Next.js 15, React 19, TypeScript, Tailwind CSS v4, Three.js, React Three
Fiber, Drei, Framer Motion, Lenis, Zustand.

Four libraries from the original brief were deliberately left out, because
including them would have cost frame time or bytes without changing anything
the visitor sees:

- **Rapier physics** — nothing here needs a solver. The "physicality" is
  springs and damping, which are cheaper and fully art-directable.
- **Theatre.js** — a studio layer for authoring animation. The camera moves
  are hand-authored and driven by a state machine; shipping an editor runtime
  to play them back is payload for no gain.
- **React Spring** — the same job is done by `Spring` in `math.ts` inside the
  render loop, without going through React reconciliation every frame.
- **Blender assets** — every model is authored procedurally instead, which is
  what keeps the payload at zero art bytes.

There are no project screenshots: the résumé contains no imagery, and
inventing UI mockups for real production systems would misrepresent them.
Each project gets a building whose *form* argues what it is, plus the full
written case study.
