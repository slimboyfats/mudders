# Mudders — Architecture

Derived from [`REQUIREMENTS.md`](REQUIREMENTS.md) (section numbers like §6.3 refer to it). This file
describes _how_ the pieces fit; the requirements say _what_ and _why_. Sections marked **(planned)**
describe work that is not built yet.

## 1. Big picture

```
            ┌──────────────── browser (each peer) ────────────────────────────┐
 inputs ──▶ │  net (WebRTC / WS relay) ──▶ sim kernel ──▶ render snapshot ──▶ renderer (Pixi pixel)
            │        ▲    lockstep inputs     │  ▲                     │        + effect passes
            │        │                        │  └── content registries (resolved manifests)
            │        │                        └──▶ audio events ──▶ chiptune player / synth
            │   React UI (Zustand) ◀── HUD state ─┘
            └─────────────────────────────────────────────────────────────────┘
                     ▲ SDP/ICE, room list, relay fallback
            signalling server (Hono + WebSocket, Render free tier)
```

Three rules hold the design together:

1. **The sim is a pure, deterministic function of (seed, content hash, input log).** Everything
   else (rendering, audio, UI, networking) observes it or feeds it inputs.
2. **The kernel is small; the game is content.** Weapons, materials, props, generators, AI, modes,
   themes, effects and audio are data manifests plus small behaviour modules in registries (§2c).
3. **Renderers only read snapshots.** No renderer calls into the sim or holds game state (§2b).

## 2. Packages and dependency direction

```
shared ◀── sim ◀── content
   ▲        ▲         ▲
   └──── client ──────┘      capture ──▶ client renderer, sim, content
signal ──▶ shared
```

| Package   | Contents                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared`  | Constants (`MAX_PLAYERS`, `TICK_RATE`), Zod schemas for manifests and every network message, effect-event and snapshot types, `PROTOCOL_VERSION`.   |
| `sim`     | Kernel: grid layers, tick loop, PRNG, registries, entity store, input application, state hash, replay. Imports only `shared`.                       |
| `content` | Packs (`core/`, later expansions). One folder per item with `manifest.json`, optional `behaviour.ts`, test. Registers into `sim` registries.        |
| `client`  | React 19 + Zustand UI, the `Renderer` interface and the lazy-loaded pixel renderer, input (touch slingshot, keyboard, mouse), WebRTC client, audio. |
| `capture` | Headless CLI: runs scenarios through `sim`, plays snapshots through the real renderer in headless Chromium (SwiftShader), encodes with ffmpeg.      |
| `signal`  | Hono HTTP + WebSocket server: `/health`, room lifecycle, SDP/ICE relay, WebSocket data relay fallback.                                              |

Lint enforces the arrows that matter: `sim` cannot import `content`, React, Pixi or the client;
`sim` and `content` cannot use `Math.random`, `Date`, timers or the DOM.

## 3. Simulation kernel (milestone 1)

### 3.1 State

All match state lives in one plain structure that is hashed for desync detection:

- **Grid**: `material: Uint8Array` (W×H), `coating: Uint8Array`, `cellState: Uint8Array` (timers,
  heat). Map sizes 800×400, 1200×600 (default), 1600×800.
- **Group records**: per prop group integrity, cell count, fallen flag (§4c), in typed arrays.
- **Entities**: tanks, projectiles, sim debris particles (`DebrisPool`: struct-of-arrays, fixed-point,
  cells in flight that become terrain where they land), zones (later).
- **Match**: PRNG state, tick, turn/round, wind, scores, money, inventories.

### 3.2 Tick

Fixed 60 Hz. The client runs an accumulator so a 120 Hz display never speeds up the sim. One tick:

1. Apply queued inputs for this tick (`applyInput(playerId, input)`).
2. Integrate projectiles (semi-implicit Euler, fixed-point), applying gravity, wind and zones.
3. Evaluate triggers; run impact pipelines (explosions, spawns, terrain ops, statuses).
4. Advance continuing terrain ops (shockwave rings, liquefy timers) within per-tick budgets.
5. Step debris particles; landed debris becomes terrain.
6. Settle + cohesion + reactions + decay, **only over the settle region**, bounded cells per tick.
7. Tanks: support, falling, burial, contact effects, damage, death explosions (with kill attribution).
8. When the shot has resolved (`quiet`), the next turn starts. `world.snapshot()` returns the render
   snapshot (terrain, coating, dirty rects, entities, debris, effect events) since the last call.

Code map (`packages/sim/src`): `world.ts` (state + tick), `grid.ts` (layers, settle region, render
rects), `settle.ts`, `debris.ts`, `materials.ts` (flat per-cell lookup tables), `scratch.ts`
(preallocated flood-fill buffers), `prng.ts` (sfc32), `fixed.ts` (fixed-point trig table), `hash.ts`,
`behaviours.ts` (behaviour interfaces + registry), `content/resolve.ts`, `replay.ts`, `scenario.ts`.

### 3.3 Determinism (§6.3)

- Seeded PRNG (mulberry32 or xoshiro128**) owned by match state; the only randomness source.
- **Decided in milestone 1: fixed-point everywhere.** Positions/velocities are integers scaled by
  `FP = 65536`, held in JS numbers with products kept < 2^53. Only `+ - * /`, `Math.trunc/floor/round`
  and `Math.sqrt` are used: IEEE 754 makes these correctly rounded and therefore identical in every
  engine. Trig comes from a 0.1° table built at load with a Taylor series in basic arithmetic. The
  golden hashes are identical under Node and Vite's runner; a Firefox/WebKit run is still owed
  (only Chromium exists in the cloud container), tracked as `needs-device`.
- Deterministic iteration only (arrays, explicit ordering; no `Map`/`Set`/key-order dependence).
- No wall-clock time; time is the tick counter.
- Golden tests: recorded seed + input log ⇒ identical state hash on every run and machine.

### 3.4 Performance (§9)

Sim ≤ 2 ms average / ≤ 6 ms worst per tick on the reference phones; `pnpm verify` will enforce ≤ 2 ms worst on x86.
Typed arrays only, preallocated flood-fill queues, work bounded by dirty regions, large ops spread
across ticks. `pnpm bench` tracks baselines; >15% regression fails `pnpm verify`.

## 4. Content system (milestone 1)

- **Discovery**: `import.meta.glob` over `packages/content/*/**/manifest.json` and `behaviour.ts`
  (`packages/content/src/glob.ts`); adding a folder registers the item with no other edits. Node
  tooling (bench, content scripts, preview) runs through Vite's module runner (`scripts/vite-run.ts`)
  so it sees exactly the same discovery.
- **Behaviour modules** (`behaviour.ts`, `export default defineFlight/defineTerrainOp/…`) carry an
  id, a `version` (hashed) and a Zod schema for their manifest parameters.
- **Validation**: each manifest type has a Zod schema in `shared` with a `schemaVersion` and
  migrations for older versions.
- **Resolution**: at startup the loader resolves every `use` and `extends` reference into a flat,
  fully resolved object (shallow-merge overrides, then validate). Missing or cyclic references are
  startup errors. The sim only ever sees resolved manifests.
- **Content hash**: hash of all enabled packs' resolved manifests + behaviour-module versions. Peers
  must match it to join.
- **Behaviour modules** receive the `SimApi` only: grid, material tables, match RNG, scratch buffers,
  tanks, wind/gravity, `launch` (cell → debris) and `emit` (effect events).
- **Ids are permanent** (`weapon.shockwave`, `material.lava`, `flight.ballistic`, …); changes that alter
  results need a new id or a pack version bump.

Weapons compose slots: `flight`, `triggers`, `impact[]`, `damage`, `effects`, `audio`, `shop`, `ai`,
`meta`. Materials define `settle`, `strength` per damage type, `reactions`, `cohesion`, `coating`,
`contact`, `decay`. Props are multi-material stamps with optional integrity groups that are written
into the grid at round start and are ordinary terrain from then on.

## 5. Rendering (milestone 2)

**Decision (open question §12): raw WebGL2, no PixiJS.** The pipeline is one palette shader, one
instanced quad batch and one post pass; Pixi would add ~150 kB for features we don't use, and owning
the GL makes captures byte-identical under SwiftShader. WebGPU stays a possible later enhancement
behind a runtime check. Revisit if the effect library (milestone 6) outgrows hand-written passes.

```ts
// packages/client/src/render/types.ts (abridged)
interface Renderer {
  mount(canvas, snapshots: SnapshotStream, options: { quality; theme; palette; shake? }): void;
  resize(cssWidth, cssHeight, dpr): void;
  setTheme(id): void;
  setQuality(q): void;
  render(time: number): void; // time in ticks; no wall clock, so captures replay exactly
  readonly camera: CameraControl; // fit, integer zoom steps, pan
  unproject(screen): Vec2; // screen (CSS px) → map
  project(map): Vec2;
  unmount(): void;
}
```

`RenderSnapshot` (in `shared`) carries terrain + dirty rects, entities (tanks with `active`/`power`,
projectiles), debris, effect events, wind, theme and `turn`. The host (local match, capture page,
later the net client) pushes one snapshot per tick through a `SnapshotStream` and calls `render()`
per display frame. `loadRenderer('pixel', w, h)` lazy-loads the implementation.

Pixel renderer (`packages/client/src/render/pixel`):

1. Terrain grid as an `R8UI` texture, dirty-rect sub-uploads (`UNPACK_ROW_LENGTH`/`SKIP_*`).
2. A shading pass re-colours only the dirty cells into a map-sized RGBA cache (palette lookup,
   per-cell grain, lit surface rows, darker overhangs, depth). Cells are never smoothed.
3. One fullscreen background pass: letterbox, sky gradient, terrain cache at the camera scale
   (nearest-neighbour), sky flash, vignette.
4. Instanced quads (`QuadBatch`) in map space: trails, debris, tanks, cosmetic particles, projectiles
   and impact flashes (normal and additive batches). Effects use the cell-snapped "pixel" shape with
   hard bands and ordered dither, never smooth glows.
5. Post pass, only while needed: shockwave distortion (a lens band evaluated per map cell that moves
   whole cells), flash tint and whole-cell screen shake.

Effect events map to handlers in `effects.ts` (`burst`, `flash`, `shake`, `ripple`, `shockwave`,
`muzzle`, `land`, `tankDeath`); unknown types are ignored. Cosmetic particles are typed-array pools
stepped once per sim tick and seeded from the event (`FxRng`), never `Math.random`. Quality scales
particle caps (800 / 2,500 / 6,000) and turns the distortion pass and vignette off on `low`.

Camera: the fit view uses an integer scale on standard-density screens and a fractional fit on
DPR ≥ 2 (a one-device-pixel difference between cells is invisible there; rounding down would waste
half a phone screen). Zoom steps are integers; the origin snaps to whole device pixels.

Client (`packages/client/src`): `game/match.ts` (`LocalMatch`: 60 Hz accumulator, max 8 ticks per
frame, snapshot stream, HUD state), `game/aim.ts` (slingshot maths), `ui/MatchView.tsx` (canvas,
pointer/keyboard input, aim preview), `ui/Hud.tsx` (wind, players, steppers, weapon strip, FIRE),
`ui/Sandbox.tsx` (§2c.5). The match and sandbox are code-split from the title screen.

## 6. Audio (planned, milestone 6; requirement §8b)

Chiptune only. Music and ambience are tracker modules (MOD/XM/S3M/IT) played by a lazy-loaded module
player such as `chiptune3` (libopenmpt in an AudioWorklet); SFX are tracker instruments and/or Web
Audio oscillator + noise synth patches described as data. `audio.*` content items reference a module
(plus pattern/instrument) or a synth patch. The sim emits audio events in the snapshot alongside
effect events; the client's audio system consumes them, so audio never affects determinism. Audio
unlocks on first tap on mobile.

## 7. Networking (planned, milestone 4)

- **Topology**: star around the host over WebRTC `RTCDataChannel`s. Peers exchange only inputs plus a
  periodic state hash. Host is authoritative on desync and sends a full snapshot to resync.
- **Connection ladder**: direct P2P via public STUN → automatic WebSocket relay through the signalling
  server if the data channel isn't open in ~5 s (same message interface) → TURN later if needed. The
  path used is logged.
- **Server-less mode**: copy-paste offer/answer strings, no backend at all.
- **Versioning**: `protocolVersion` negotiated at connect (`hello`/`welcome`, already implemented in
  `shared` + `signal`), content hash checked at join.
- **Lobby messages** (Zod, in `shared`): `createRoom`, `listRooms`, `joinRoom(code)`, `leaveRoom`,
  `offer`/`answer`/`ice`, `roomUpdate`, `startMatch`. Rooms in memory with TTL; 6-char private codes;
  rate-limited creation.
- **Resilience**: inputs buffered and re-sent; ~20 s reconnect window, then AI takeover; on
  `visibilitychange` the client replays missed inputs from the host.

## 8. Capture and visual review (milestone 0 smoke, full CLI in milestone 2)

Built in milestone 0: `pnpm smoke` launches headless Chromium with SwiftShader
(`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`), renders a WebGL2 triangle at a
fixed step, checks pixels, screenshots, and encodes a palette-quantised GIF with ffmpeg. This proves
the full capture path in a GPU-less container.

`pnpm capture` (milestone 2, `packages/capture/src/capture`): Node runs the scenario through the
sim (`ScenarioDriver`); `toWire` packs each tick's snapshot (dirty rects as base64 patches); the real
pixel renderer, bundled from `packages/client/src/capture/entry.ts` with Vite, runs in headless
Chromium. Two pages receive every snapshot and each draws alternate frames (rendering never mutates
renderer state, so this is exact). Frames come back as PNG and ffmpeg writes the MP4 (default), GIF
(`--gif`), a sheet (impact, +0.5 s, settled) and a JSON sidecar (seed, content hash, renderer hash,
state hash, git sha). A cache keyed on scenario + content hash + renderer bundle hash + options skips
unchanged captures. `--diff` compares the sheet against `captures/reference/`. Presets live in
`presets.ts` (`weapon-showcase` solves the aim by running the sim). `pnpm play:smoke` drives the
built client on emulated phones and a laptop with real touch/mouse input.

Not built yet: `--compare <gitref>` and `--audio` (audio arrives in milestone 6).

## 9. Infrastructure

- **Client**: static build (`pnpm --filter @mudders/client build` → `packages/client/dist`) for a free
  static host. Per-branch preview deploys should use the host's own Git integration (e.g. Cloudflare
  Pages builds on its side) rather than GitHub Actions; not wired up yet. Signalling URL comes from
  `VITE_SIGNAL_URL`.
- **Signalling**: Node on Render free tier (`pnpm --filter @mudders/signal start`, `PORT` env). The
  client must handle cold starts ("waking up the lobby server…").
- **No GitHub Actions**, to save build minutes. `pnpm verify` (lint, format check, typecheck, test,
  build, smoke) runs locally in the dev session before every push; failures are fixed there. Where the
  requirements say "CI", read "`pnpm verify`".
- **Browser target**: root `browserslist` is `baseline 2026`; Vite's esbuild target is derived from it.
