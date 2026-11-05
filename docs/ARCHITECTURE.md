# Mudders — Architecture

Derived from [`REQUIREMENTS.md`](REQUIREMENTS.md) (section numbers like §6.3 refer to it). This file
describes _how_ the pieces fit; the requirements say _what_ and _why_. Sections marked **(planned)**
describe milestone 1+ work that is not built yet.

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

## 3. Simulation kernel (planned, milestone 1)

### 3.1 State

All match state lives in one plain structure that is hashed for desync detection:

- **Grid**: `material: Uint8Array` (W×H), `coating: Uint8Array`, `cellState: Uint8Array` (timers,
  heat). Map sizes 800×400, 1200×600 (default), 1600×800.
- **Group records**: per prop group integrity, cell count, fallen flag (§4c), in typed arrays.
- **Entities**: tanks, projectiles, sim particles (debris that becomes terrain), zones. Stored as
  struct-of-arrays where hot.
- **Match**: PRNG state, tick, turn/round, wind, scores, money, inventories.

### 3.2 Tick

Fixed 60 Hz. The client runs an accumulator so a 120 Hz display never speeds up the sim. One tick:

1. Apply queued inputs for this tick (`applyInput(playerId, input)`).
2. Integrate projectiles (semi-implicit Euler, fixed-point), applying gravity, wind and zones.
3. Evaluate triggers; run impact pipelines (explosions, spawns, terrain ops, statuses).
4. Advance continuing terrain ops (shockwave rings, liquefy timers) within per-tick budgets.
5. Settle + cohesion + reactions + decay, **only over dirty rects**, bounded cells per tick.
6. Tanks: support, falling, burial, contact effects, damage, death explosions (with kill attribution).
7. Emit the render snapshot and effect/audio events.

### 3.3 Determinism (§6.3)

- Seeded PRNG (mulberry32 or xoshiro128**) owned by match state; the only randomness source.
- Integer / fixed-point math for everything that touches the grid; trig via lookup tables. The
  fixed-point vs. verified-float question for trajectories is settled in milestone 1 with a
  cross-browser test.
- Deterministic iteration only (arrays, explicit ordering; no `Map`/`Set`/key-order dependence).
- No wall-clock time; time is the tick counter.
- Golden tests: recorded seed + input log ⇒ identical state hash on every run and machine.

### 3.4 Performance (§9)

Sim ≤ 2 ms average / ≤ 6 ms worst per tick on the reference phones; CI enforces ≤ 2 ms worst on x86.
Typed arrays only, preallocated flood-fill queues, work bounded by dirty regions, large ops spread
across ticks. `pnpm bench` tracks baselines; >15% regression fails a PR.

## 4. Content system (planned, milestone 1)

- **Discovery**: `import.meta.glob` over `packages/content/*/**/manifest.json`; adding a folder
  registers the item with no other edits.
- **Validation**: each manifest type has a Zod schema in `shared` with a `schemaVersion` and
  migrations for older versions.
- **Resolution**: at startup the loader resolves every `use` and `extends` reference into a flat,
  fully resolved object (shallow-merge overrides, then validate). Missing or cyclic references are
  startup errors. The sim only ever sees resolved manifests.
- **Content hash**: hash of all enabled packs' resolved manifests + behaviour-module versions. Peers
  must match it to join.
- **Behaviour modules** receive the match RNG and the grid API only.
- **Ids are permanent** (`weapon.shockwave`, `material.lava`, `flight.ballistic`, …); changes that alter
  results need a new id or a pack version bump.

Weapons compose slots: `flight`, `triggers`, `impact[]`, `damage`, `effects`, `audio`, `shop`, `ai`,
`meta`. Materials define `settle`, `strength` per damage type, `reactions`, `cohesion`, `coating`,
`contact`, `decay`. Props are multi-material stamps with optional integrity groups that are written
into the grid at round start and are ordinary terrain from then on.

## 5. Rendering (planned, milestone 2)

```ts
interface RenderSnapshot {
  terrain: Uint8Array;
  dirtyRects: Rect[];
  entities: EntityView[];
  effectEvents: EffectEvent[];
  wind: number;
  theme: string;
}
interface Renderer {
  mount(canvas: HTMLCanvasElement, snapshots: SnapshotStream, quality: Quality): void;
  resize(): void;
  setTheme(id: string): void;
  unmount(): void;
  unproject(screen: Vec2): Vec2; // screen → map coords
}
```

Pixel renderer pipeline: sky → terrain grid as an `R8` texture through a palette-lookup shader at an
integer scale, nearest-neighbour, dirty-rect sub-uploads (< 1 ms) → coating overlay → entities and
trails at native resolution → GPU particles → post-process effect passes driven by effect events →
React/DOM HUD outside the canvas. Effect events (`shockwave`, `flash`, `haze`, `burst`, …) are
renderer-agnostic and fire-and-forget: dropping one never changes sim state. Quality low/medium/high
scales particles and disables heavy filters. Everything must run on WebGL2 via SwiftShader for capture.
PixiJS v8 vs. raw WebGL2 is decided in milestone 2 with a shockwave-filter spike.

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

Planned `pnpm capture <scenario>`: Node runs the sim headlessly from a Zod-validated scenario file
(`scenarios/*.json`) → the snapshot stream is played through the real renderer in Chromium at a fixed
step → frames → ffmpeg GIF/MP4 + `--sheet` PNG + JSON sidecar. Same inputs give byte-identical frames,
enabling `--diff` visual regression against `captures/reference/` and `--compare <gitref>`.

## 9. Infrastructure

- **Client**: static build deployed to Cloudflare Pages. `.github/workflows/preview.yml` deploys every
  PR/branch to a preview URL and comments it on the PR (needs `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` secrets; skips without them). Signalling URL comes from `VITE_SIGNAL_URL`.
- **Signalling**: Node on Render free tier (`pnpm --filter @mudders/signal start`, `PORT` env). The
  client must handle cold starts ("waking up the lobby server…").
- **CI** (`.github/workflows/ci.yml`): lint, format check, typecheck, test, build, plus a smoke job that
  installs ffmpeg and Chromium and runs `pnpm smoke`, uploading the PNG/GIF as an artifact.
- **Browser target**: root `browserslist` is `baseline 2026`; Vite's esbuild target is derived from it.
