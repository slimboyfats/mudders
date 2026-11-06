# Mudders — Requirements

*Set the mud on fire.*

A browser-based spiritual successor to *Scorched Earth* (1991): turn-based artillery combat on fully destructible terrain, with a large arsenal, an in-match economy, and online multiplayer that works across networks without players having to be on the same LAN.

Name: **Mudders**. Tagline: *Set the mud on fire.* Package scope `@mudders/*`.

---

## 1. Goals and non-goals

### Goals
- Capture the *feel* of Scorched Earth: angle/power aiming, wind, "dirt" that falls, chain reactions, absurd weapons, shields, and the between-round shop.
- Run entirely in the browser; no install.
- Online play against friends (private) and strangers (public) over the internet.
- **Playable on a phone from day one.** Touch is a first-class input, not a port. A full match fits in a 5–10 minute break.
- Keep hosting cost at **zero** for the foreseeable future.
- Be a **content-driven, modular codebase**: every weapon, material, terrain generator, AI, theme and game mode is its own module, composed from small reusable behaviours and described as versioned data, so the game can grow indefinitely without touching the core (see §2c).

### Non-goals (v1)
- Not a copy. The feel is Scorched Earth; the *effects* are what make it a successor — shader-driven weapons and terrain that moves, flows and reshapes rather than only cratering (see §2a, §4a). Still not 3D.
- No accounts, no persistent progression, no ranked ladder in v1.
- No more than 4 players per match in v1. The sim and net code must not hard-code 4 (target 8 later), but UI, map sizing and balance are tuned for 2–4. Milestone 7 raised the cap to 8 (`MAX_PLAYERS`); 2–4 stays the tuned default.
- No long-form matches (hour-long 8-player slogs). Short rounds are the design, not a limitation.
- No reproduction of Scorched Earth assets, names of weapons, or text. Original content only.

---

## 2. Tech stack (fixed)

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | Everywhere, including the signalling server. |
| UI | React 19 | Menus, lobby, HUD, shop. |
| Rendering | **WebGL2 via PixiJS v8** (WebGPU where available), behind a renderer interface that permits alternative renderers later (see §2b). | The canvas runs at **native device resolution** (full DPR) like any web app. The terrain grid (the *map*, sized per match; see §2a) is the only low-res layer, drawn nearest-neighbour at an integer scale chosen by a per-client zoomable camera; HUD, text, effects and particles are full-resolution. The terrain `Uint8Array` is uploaded each tick as a single-channel texture and drawn by a palette-lookup shader; weapons and ambient effects are GLSL filters and GPU particle sprites on top. Pixi is a rendering layer only — no Pixi physics, no scene-graph game logic. three.js is not in v1; a future voxel renderer could bring it in behind the same interface. Raw WebGL2 without Pixi is acceptable if the team prefers; the sim/renderer boundary is the same. |
| Build | Vite | |
| State | Zustand (UI) + a plain, framework-free simulation core | The simulation must not depend on React. |
| Tests | Vitest | Simulation core must be unit-testable headlessly. |
| Lint/format | ESLint + Prettier | |
| Audio | Chiptune only: tracker modules via a module player (e.g. `chiptune3`) + Web Audio synth SFX | See §8b. |
| Networking | WebRTC `RTCDataChannel` (peer-to-peer) | See §6. |
| Signalling / lobby | Small Node (Fastify or Hono) + WebSocket server | Hosted on a free tier (Render.com). See §7. |
| Persistence | None required for v1. Optional Postgres (Render free tier / Neon / Supabase) for public lobby listing if in-memory proves insufficient. | |
| Package layout | pnpm monorepo | `@mudders/sim`, `@mudders/client`, `@mudders/signal`, `@mudders/shared`, `@mudders/content`, `@mudders/capture`. |

---

## 2a. Aesthetic direction (the feel, plus the spectacle)

The *feel* is Scorched Earth: one static screen, a silhouette of dirt against a sky, tiny tanks, a dot arcing through the wind, a crater and a collapse. The *spectacle* is new: shaders, particles and terrain that moves in ways the original never could. The rule for every effect is **"does it make the dirt do something interesting?"** — effects should be about the terrain and the shot, not decoration.

**Keep (these define the feel):**
- **Whole map by default, zoom when you want.** The default view fits the entire map on screen, as in the original, so the shot-and-consequence is always readable. The player can zoom and pan freely (pinch/drag on touch, wheel/drag on desktop); zoom is per client and purely visual. No automatic follow-cam during shots — a brief zoom-punch on huge hits is the only automatic camera motion, and it can be disabled.
- **Pixel terrain, native everything else.** The terrain grid is the only low-resolution thing on screen: 1 cell = 1 grid pixel, drawn nearest-neighbour at an integer scale, so craters, tunnels, flows and displacement are visibly made of pixels. The canvas itself, and every other layer — HUD, text, menus, post-process effects, particles, trails, coating sheens — renders at full native device resolution (DPR-aware), exactly like a normal website. The result is a crisp modern app with a chunky playfield, not a scaled-up retro screen. Effects may *light*, *distort* and *colour* the terrain, but never smooth it out.
- **Small, readable silhouettes.** Tanks ~16×10 px, projectiles as dots with persistent trails. Nothing on screen competes with the terrain for attention.
- **Fast resolution.** A shot resolves in ~3 s including the fanciest effect; spectacle never pads the round.

**Encouraged (this is where the "successor" lives):**
- **Shader effects**: screen-space shockwave ripple/refraction on impact, heat haze over napalm, chromatic split and bloom on nukes, scanline/vignette as optional theme flavour, palette cycling (lava, water, energy weapons), lightning glow, slow-mo flash on a kill.
- **GPU particles**: thousands of sparks, embers, dust and dirt chunks per explosion. Cosmetic particles are unlimited; particles that *become terrain* are simulated (see §4a).
- **Terrain dynamics as the weapon design space**: shockwaves that push dirt outward and pile it up, gravity wells that pull it in, liquefaction that makes a hill flow, freezing that turns sand to rock, terraforming that raises or lowers a region. See §4a and §5.
- **Lighting-flavoured effects** done cheaply: a glow texture, an emissive mask for lava/energy, a sky that reacts to big explosions (flash, colour shift). No real lighting model.
- **Themes** with distinct palettes and ambient effects (snow particles, rain that wets and darkens dirt, dusk sky).

**Avoid (breaks the feel):**
- 3D geometry, perspective, true lighting/shadow models.
- Textured/sculpted terrain or anything that hides the pixel grid.
- Large character sprites or animation that pulls focus from the terrain.
- Effects that obscure the map for more than a moment — players need to read the new terrain immediately after a shot.
- Effects that are purely cosmetic *and* slow: everything heavy runs on the GPU and can be scaled down by a quality setting (mobile defaults to "medium").

**Rendering pipeline (summary)**:
1. Sim emits: terrain buffer (dirty rects), entity list (tanks, projectiles, sim particles), and an *effect event* list (`{type, x, y, radius, t}`).
2. Renderer (native-resolution framebuffer) draws sky/background → terrain grid via palette shader at integer scale, nearest-neighbour → coating overlay → entities and trails (native res, sub-pixel) → GPU particles → effect passes (post-process filters at native res, driven by effect events) → HUD overlay (React/DOM, outside the GL canvas).
3. Effect events are fire-and-forget: a peer that drops an effect still has the same sim state.

---

## 2b. Renderer interface (extension point for voxels and other views)

Only the pixel renderer is in scope. But the architecture must make it possible to add a different view later — specifically a **voxel** view, where the same 2D grid is extruded into a slab of cubes drawn in 3D with a fixed camera, to explore 3D-flavoured effects. Gameplay would remain strictly 2D in such a view. To keep that door open without building it:

- The sim exposes a read-only **render snapshot** per tick: `{ terrain: Uint8Array, dirtyRects, entities[], effectEvents[], wind, theme }`. Renderers consume this and nothing else; no renderer may call into the sim or hold game state.
- A `Renderer` interface: `mount(canvas, snapshotStream, quality)`, `resize()`, `setTheme()`, `unmount()`. The pixel renderer is the only implementation in v1, lives in `packages/client/render/pixel`, and is loaded lazily so a second one can be too.
- **Effect events are renderer-agnostic** (`shockwave`, `flash`, `haze`, `burst`, …) with parameters, never shader-specific. Each renderer maps them to its own implementation; an unknown event is ignored.
- Input works in logical 2D map coordinates; the renderer provides `unproject(screenXY) → mapXY` (identity for the pixel renderer, a camera unprojection for anything 3D).
- HUD is DOM/React outside the canvas, so it is renderer-independent.
- The sim never knows which renderer is mounted. Any proposal that needs the sim to "know about" voxels is a smell.

Nothing more than the interface is built in v1. A voxel renderer, if it happens, is a post-v1 experiment (three.js, chunked greedy-meshed slab, rebuilt per dirty rect) and must be additive — no changes to sim, networking or weapons.

---

## 2c. Modularity and content versioning

The engine is a small kernel; everything players actually experience is **content** — modules that plug into registries. This applies to all parts of the game, not only weapons.

### 2c.1 Principles
- **Kernel vs content.** `packages/sim` core = grid, tick loop, PRNG, entity store, registries, input/replay. Everything else (weapons, materials, generators, AI, game modes, themes, effects, sounds) is content in `packages/content/*`, one directory per item. The kernel never imports content.
- **Composition over inheritance.** A weapon is not a class hierarchy; it is a data manifest that *composes* behaviours from registries: a flight behaviour, impact behaviours, terrain ops, an effect profile, a sound profile. New combinations should be possible by editing data only; new behaviours are small modules added to a registry.
- **Data first, code when needed.** Each content item is a folder with a `manifest.json` (typed, Zod-validated) plus optional TS modules for behaviour that can't be expressed as data. Most weapons should be pure data.
- **Reference + override, never copy.** Reusable pieces — explosions, flights, trails, effect profiles, sound profiles, terrain ops — are themselves content items with sensible defaults. A weapon *references* them by id and overrides only what differs: `"explosion": { "use": "explosion.standard", "radius": 12 }`. Items can `extends` another item of the same type (`explosion.nuke extends explosion.standard`). Overrides are shallow-merged and schema-validated against the base; changing a base item changes everything that references it without overriding — that is how balance passes and visual upgrades roll out across the arsenal. Copy-pasting a config between manifests is a review failure.
- **Registries with stable ids.** Every item has a string id (`weapon.shockwave`, `material.lava`, `flight.ballistic`, `impact.explode`, `terrainop.displace`, `effect.ripple`, `gen.hills`, `ai.poolshark`, `mode.classic`, `theme.dusk`). Ids are permanent; renaming creates a new id and deprecates the old one.
- **Hot-pluggable in dev.** Adding a content folder registers it with no edits elsewhere (Vite `import.meta.glob` on the content tree). Each item ships with its own tests and a README-level `description` in its manifest.
- **Deterministic by construction.** Behaviour modules receive the match RNG and grid API; they cannot reach `Math.random`, time, DOM or the renderer. Lint rules enforce this on `packages/content` as they do on `packages/sim`.

### 2c.2 Weapon anatomy
A weapon manifest composes these slots (all from registries, each with parameters):

| Slot | What it defines | Examples (ids) |
|---|---|---|
| `flight` | How the projectile moves each tick | `ballistic`, `roller` (follows surface), `digger` (tunnels), `beam` (instant line), `homing`, `drifting` (wind-heavy), `bouncing` |
| `triggers` | When impact happens | `onSolid`, `onTank`, `onTimer`, `onApex`, `onWall`, `onProximity` |
| `impact[]` | Ordered list of things that happen on trigger | `explosion{use: "explosion.standard", …overrides}`, `spawn{weaponId, count, spread}` (MIRV/Funky), `terrainOp{use: "terrainop.displace", …}`, `applyStatus{tank, status}`, `chain{weaponId}`, `delay{ticks}` |
| `terrainOps` | Parameterised ops from §4a used by impacts | `carve`, `add`, `displace`, `attract`, `liquefy`, `harden`, `raise`, `convert`, `burn` |
| `damage` | Damage model and **damage type** (looked up against material `strength`, §4b) | `radial`, `direct`, `dot` (over turns), `none`; types `blast`, `kinetic`, `heat`, `cold`, `shock`, `dig`, `corrosive` |
| `effects` | Renderer-agnostic effect events (§2a/§2b) with parameters | `burst`, `ripple`, `flash`, `haze`, `trail`, `palettecycle`, `shake` |
| `audio` | Sound profile ids | `fire.heavy`, `impact.nuke`, `ambient.burn` |
| `shop` | Price, pack size, availability, tier, unlock conditions | |
| `ai` | Hints for AI valuation (expected damage, terrain value, risk) | |
| `meta` | Display name, description, icon, category, tags, `version`, `since` (content-pack version) | |

**Explosions are first-class content** (`explosion.*`). An explosion item bundles everything one blast means: carve shape and radius, material hardness multipliers, damage model and falloff, debris spawn (count, material, velocity — these become terrain), the effect profile (`burst`, `ripple`, `flash`, `shake` with parameters) and the sound. `explosion.standard`, `explosion.nuke`, `explosion.riot` (terrain only, no damage), `explosion.dirt` (adds instead of carves), `explosion.shockwave` (displace op, no crater) are examples; weapons pick one and tune it. The same applies to `flight.*` (a `flight.roller` with default speed and friction), `trail.*`, `effect.*` and `audio.*`.

A **Heavy Roller** is then: `flight: {use: "flight.roller", speed: 1.4}`, `triggers: [onTank, onWall, onTimer{t}]`, `impact: [{explosion: {use: "explosion.standard", radius: 40}}]`. A **Baby Missile** is `flight.ballistic` + `explosion.standard` with `radius: 12` and nothing else. A **Shockwave** is `flight.ballistic`, `triggers: [onSolid, onTank]`, `impact: [{explosion: {use: "explosion.shockwave", pushRadius: 90}}]`. **Singularity** is `impact: [{terrainOp: "terrainop.attract"}, {delay: 20}, {explosion: {use: "explosion.nuke"}}, {terrainOp: "terrainop.displace"}]`.

Example manifest (abridged):

```json
{
  "id": "weapon.heavy-roller",
  "schemaVersion": 1,
  "meta": { "name": "Heavy Roller", "category": "roller", "since": "core@1.0.0" },
  "flight": { "use": "flight.roller", "speed": 1.4, "maxTicks": 600 },
  "triggers": ["onTank", "onWall", { "onTimer": 600 }],
  "impact": [{ "explosion": { "use": "explosion.standard", "radius": 40, "damage": 60 } }],
  "effects": { "trail": { "use": "trail.dust" } },
  "audio": { "fire": "audio.fire.heavy" },
  "shop": { "price": 5000, "pack": 2, "tier": 2 },
  "ai": { "expectedDamage": 45, "terrainValue": 0.1 }
}
```

New behaviour that none of the existing slots express (say, a projectile that splits the map in two) is a new flight/impact module registered under a new id — never a special case in the kernel.

### 2c.3 The same pattern everywhere
- **Materials** (`material.*`): see §4b — palette role, settle rule, strength/weakness per damage type, reactions, contact effects, decay.
- **Props** (`prop.*`): see §4c — houses, trees, bunkers, rocks, ruins: multi-material stamps placed on the map at round start.
- **Terrain generators** (`gen.*`): seeded `generate(width, height, rng, params) → grid`, plus tank-placement strategy.
- **Terrain ops** (`terrainop.*`): the §4a bulk operations; new ops register here.
- **AI personalities** (`ai.*`): aim strategy, weapon valuation, shopping strategy, each separately pluggable.
- **Game modes** (`mode.*`): round structure, turn order, win condition, sudden-death rule, scoring weights, starting loadout, allowed content.
- **Themes** (`theme.*`): palette, sky, ambient effects, music/ambience ids.
- **Explosions** (`explosion.*`), **flights** (`flight.*`), **trails** (`trail.*`), **audio profiles** (`audio.*`): the reusable building blocks weapons reference and override.
- **Effects** (`effect.*`): renderer-side implementations of effect events, per renderer. Effect *profiles* (parameter sets) are data; effect *implementations* (shaders, particle emitters) are code registered per renderer.
- **Items / shields / utilities** share the weapon pipeline with `flight: none`.

### 2c.4 Versioning
- **Content packs.** Content is grouped into packs (`core`, later `expansion-1`, community packs…). Each pack has a semver `version`; each item carries `since` (pack version it appeared in) and optional `deprecated`.
- **Content hash.** At match start the host computes a hash over the enabled packs' manifests + behaviour-module versions; every peer must match or the join is refused with a clear "update your game" message. This is what keeps lockstep safe when content changes.
- **Schema versions.** Manifest schemas carry a `schemaVersion`; loaders include migrations so old manifests keep loading. Same for replays/saves (`replayVersion`) and the net protocol (`protocolVersion`, negotiated at connect).
- **Rules for change.** Never change what an existing id does in a way that alters simulation results within a released pack version; add a new id or bump the pack version. Balance tweaks are pack-version bumps.
- **Resolved manifests.** The loader resolves all `use`/`extends` references into a flat, fully-resolved object at startup (and that is what gets hashed), so the sim never follows references at runtime and a missing or cyclic reference is a startup error, not a mid-match bug.
- **Mode-level allow-lists.** A game mode or lobby can enable/disable packs and individual items (e.g. "classic only", "no terrain-dynamics weapons"), expressed as data.

### 2c.5 Developer workflow
- `pnpm content:new weapon <id>` scaffolds a folder with manifest, test and docs stub.
- `pnpm content:validate` runs schema validation, resolves all references (fails on missing/cyclic), checks ids are unique and permanent, flags near-duplicate configs that should be a `use` + override, and that every item has a test.
- `docs/WEAPONS.md` (and equivalents) are **generated** from manifests, never hand-written.
- A dev-only **content sandbox** screen: pick any weapon, fire it at a test map, watch the result, tweak manifest params live with hot reload. Includes a **prop painter**: draw a prop's cells with a material palette and export the bitmap + manifest. This is the main tool for building new content quickly.
- A **headless capture CLI** (§2d) that renders a scripted scenario to GIF/MP4 so an agent can show its work for approval without a human driving the game.

### 2d. Headless capture — agent-driven visual review

Much of the build will be done by coding agents. Text can't communicate whether a shockwave *looks* right, so the project ships a tool that turns any scenario into a short video the agent attaches for approval or refusal.

**Requirements**
- `pnpm capture <scenario> [--gif|--mp4] [--quality low|med|high] [--renderer pixel] [--seed N] [--fps 30] [--scale 2]` renders a scenario and writes `captures/<scenario>-<timestamp>.{gif,mp4}` plus a `.json` sidecar (seed, content hash, scenario, duration, frame count, git sha).
- **Scenario = data.** A scenario file (`scenarios/*.json`, Zod-validated) declares: map generator + seed, theme, tanks (positions, health, inventories), wind, a list of timed inputs (`{t, player, action}` — aim, fire, move, buy), and capture window (`fromTick`, `toTick`, or "until settled + 1 s"). Because the sim is deterministic the same scenario always produces the same frames, so a capture is a reproducible artefact, not a recording of someone playing.
- **Scenario presets** for every content type: `weapon-showcase` (fire weapon X at a standard target map from three ranges), `explosion-compare` (A vs B side by side), `terrain-op` (op on a hill), `material` (drop material on slope), `theme` (ambient loop), `mode-smoke` (a full fast round with bots). `pnpm content:new` generates a matching scenario stub for every new item so "show me" is one command.
- **Pipeline.** Node runs the sim headlessly to produce snapshots; Playwright-driven Chromium mounts the real renderer on an offscreen canvas, plays the snapshot stream at a fixed step (no wall-clock), and captures frames via `canvas.toBlob`/CDP screencast; ffmpeg encodes (GIF via palette-gen for small size, H.264 MP4 for longer clips). Audio optional in MP4.
- **Must work in a GPU-less cloud container.** Development happens in cloud agent sessions with no GPU and no display. Chromium runs headless with SwiftShader (`--use-gl=angle --use-angle=swiftshader`, `--enable-unsafe-swiftshader`); the renderer must function on WebGL2-via-software, and shaders must stay within what SwiftShader supports (no WebGPU-only paths without a WebGL2 fallback). Frames are captured at fixed step, so software-GL slowness affects wall time, not output. Playwright and Chromium are preinstalled in the sessions; ffmpeg is installed via apt or a static binary and checked at CLI start with a clear error if absent.
- **Delivery to the reviewer.** The CLI prints the output paths last, on their own lines, so the agent can send the files into the conversation. GIFs are kept ≤ 4 MB (downscaled to 640×360 if needed, 20–30 fps, ≤ 6 s, palette-quantised) so they preview inline on a phone; longer or higher-quality clips go to MP4. A `--sheet` PNG is produced alongside every capture as the lightweight fallback.
- **Fast.** A 5-second weapon showcase renders in ≤ 15 s on CI hardware. Captures are cached by (scenario hash, content hash, renderer version); unchanged inputs don't re-render.
- **Deterministic output.** Same inputs → byte-identical frames (fixed step, seeded RNG, no `Date`). This enables **visual regression**: `pnpm capture --diff` compares against committed reference frames and fails on perceptual difference above a threshold, so a shader change can't silently break an old weapon's look.
- **Review loop.** The agent's workflow for any visual change is: implement → `pnpm capture <scenario>` → attach the clip with a one-line "approve / refuse?" → iterate. `CLAUDE.md` makes this mandatory for new weapons, explosions, terrain ops, effects and themes, and for any change to the renderer.
- **Side-by-side and before/after.** `--compare <gitref>` renders the same scenario at another commit and stitches the two horizontally with labels, for refactors and balance passes.
- **Multi-shot sheets.** `--sheet` produces one PNG contact sheet of key frames (impact, +0.5 s, settled) for a quick glance when a video is overkill.
- **Mobile frame.** `--device s23plus|iphone14` renders at that viewport and DPR, with the touch HUD visible, so mobile layout can be reviewed the same way. `--zoom k --center x,y` captures a zoomed view for close-ups of props and coatings.

**Non-goals.** Not a replay system for players (that is §8), not a trailer tool — though it can obviously be used for one later. No GUI; it's a CLI for agents and CI.

**What the cloud agent cannot verify, and how it's covered.** Real-device performance (S23+, iOS Safari), touch feel, and WebRTC over real NATs cannot be tested from a container. For those the agent produces: (a) a deployed preview URL (static client on the free host; signalling server on Render preview env) and asks for a hands-on check with a short checklist, (b) emulated captures with `--device s23plus`, and (c) a Playwright touch-gesture script for the slingshot control as a smoke test. Anything requiring a physical device is tagged `needs-device` in the task list rather than claimed done.

**Deliverables**: `packages/capture` (CLI + Playwright harness + ffmpeg wrapper), `scenarios/` directory, `captures/` gitignored except `captures/reference/` for regression baselines.

---

## 3. Core gameplay

### 3.1 Match structure
- 2–4 players per match in v1 (humans and/or AI bots), 2–8 from milestone 7. Code paths are written for N players; the cap is a config constant.
- **Target match length: 5–10 minutes.** Default 3 rounds; "quick" preset = 1 round, "long" = 5. Each round is played on a freshly generated map.
- Pacing budget (per 4-player round, must be verified in playtesting): ~8 turns per player × ~10 s per turn ≈ 2–2.5 min of play + ~30 s shop. Everything below serves that budget.
- Turn order: configurable — simultaneous (all players fire, then resolve), sequential (random order each round), or sequential ordered by previous-round score (lowest first). Default: sequential, random.
- A round ends when ≤1 player (or team) is alive, or after a turn cap (default 12 turns per player) at which point survivors are ranked by health and points.
- **Sudden death**: from turn 8 onward, all weapon damage ×1.5 and the map edges start collapsing inward, to prevent stalemates and keep rounds short.
- Between rounds: the shop (§3.6).
- Match ends after the last round; final scoreboard.

### 3.2 Tanks
- Each player controls one tank with position, angle (0–180°), power (0–1000), health (0–100), shield state, fuel, inventory, and money.
- Tanks sit on the terrain surface. If the terrain under a tank is destroyed, the tank falls; fall damage proportional to distance (configurable, can be disabled).
- Tanks have a small collision footprint and can be hit directly by projectiles.
- **Tank types** (`tank.*` content, core@0.13.0): each seat picks a tank on the setup screen or in the online lobby (guests pick their own; bots default to their personality's favourite; "Random" draws from the match seed). Every strength costs something: Classic (default, the standard tank), Bruiser (150% health, big 20×12 body, half drive), Howitzer (+30% shell damage, 80% health), Scout (12×7 body, double drive, 70% health), Bulwark (50-point shield that soaks hits first and refills each round, −15% shell damage), Longshot (+20% shell speed, 85% health). The kernel reads only numbers (health %, shield, body, damage %, muzzle %, drive %); the sprite is renderer-only.
- Tanks can move left/right a limited distance per turn if they have fuel (bought in the shop). Movement is blocked by slopes above a threshold.
  - Implemented (core@0.16.0): hold ◀ ▶ (or A / D) while aiming, and the tank is drawn leaning with the slope it stands on; a `drive` input starts or stops rolling one cell every `mode.drive.ticksPerCell` ticks. Each turn allows `mode.drive.cells` (40) × the tank type's `drive` percent; steps up to `drive.climb` (3) cells are climbed, anything steeper stops the tank. Every cell burns one fuel: tanks start with `drive.startFuel` (80), keep leftovers between rounds and buy a Fuel Tank (+40 for $500, up to 400) in the shop. Driving never ends the turn: drive, then aim and fire. Bots drive too (core@0.17.0, see §3.7).
- Death: tank explodes (configurable size, destroys terrain, can damage neighbours — chain reactions are a feature, not a bug).

### 3.3 Aiming and firing
- Input: angle and power via keyboard (fine and coarse steps), mouse drag on the tank, and direct numeric entry.
- A turn is: optionally move → select weapon → set angle/power → fire → watch resolution.
- Turn timer, configurable (default 15 s; 10 s in "quick"); on timeout the shot fires with your current settings. Your last angle/power are preserved between turns so a quick adjust-and-fire takes 2–3 s.
- Shot resolution (flight + explosion + dirt settling) must complete within ~3 s; long effects are cut or sped up rather than allowed to pad the round.
- Projectile trail is drawn and persists faintly until the next turn (classic "I see where that went" feedback).

### 3.4 Physics
- Fixed-timestep simulation (e.g. 60 Hz), fully **deterministic** (see §6.3).
- Gravity (configurable).
- **Wind**: horizontal force, changes per round or per turn (host setting), with a visible wind indicator. Options: none / constant / changes each turn / random gusts.
- Projectile motion is integrated numerically (semi-implicit Euler) so wind, gravity and special weapon behaviour (rollers, bouncers, homing) can all share one loop.
- Walls (map edges): configurable per match — bounce, wrap-around, absorb, random, or "concrete" (projectile explodes on wall).
- Ceiling: off-screen projectiles continue to be simulated until they return or exceed a bound.

### 3.5 Damage and scoring
- Explosions deal damage by distance from centre, falloff curve per weapon.
- Points: damage dealt, kills, self-damage penalty, survival bonus, round-win bonus. Weights configurable.
- Money earned is derived from points (plus an "interest" rate option on unspent money, as in the original).
- Kill attribution tracks the originating shooter through chain reactions (so a kill caused by a neighbour's death explosion from your shot is yours).

### 3.6 Economy and shop
- Between rounds every player visits the shop, with a 30 s timer (auto-ready on expiry). Items: weapons (in packs, e.g. 10 × Missile), shields, fuel, parachutes, repair kits, utilities.
- Players start each match with a small loadout so round 1 is interesting without a pre-round shop.
- Prices fluctuate ±X% per round around a base price (host setting; can be fixed).
- Money persists across rounds within a match. Starting cash is a host setting.
- Inventory is per-player and consumed on use.
- The shop is a React screen; the simulation core exposes `buy(itemId, qty)` with validation.

### 3.7 AI opponents
Several AI personalities, selectable per bot slot. Minimum set:
- **Moron** — random angle/power, never adjusts.
- **Shooter** — adjusts toward the last miss by bracketing.
- **Poolshark** — solves the ballistic equation directly, accounts for wind; small random error.
- **Tosser** — like Poolshark but prefers lobbing (high angles) and heavy weapons.
- **Cyborg** — near-perfect aim, buys optimally, targets the weakest/closest player.
AI decisions run inside the deterministic simulation so all peers compute the same result.
- Bots can do everything a human player can except host: pick a tank type, drive (burning fuel), buy weapons and fuel in the shop, and fire any weapon they own. Implemented in core@0.17.0: Cyborg and Poolshark drive to a spot with a clear shot when theirs is blocked, Tosser backs off from close tanks, Shooter closes in on far ones and dodges after a hit, Moron wanders at random; each tops up its fuel in the shop, and Poolshark/Tosser now and then use the dirt and terrain weapons they buy.

---

## 4. Terrain ("particle-based maps")

### 4.1 Representation
- The map is a 2D grid of cells sized per match (Small 800×400, Medium 1200×600 default, Large 1600×800; see §2a). Each cell holds a material id in a `Uint8Array`; a secondary `Uint8Array` holds coating ids and a third per-cell state byte where an effect needs one.
- Materials (v1): `AIR`, `DIRT`, `ROCK` (harder, resists small explosions), `SAND` (falls more readily), plus a reserved range for future materials (ice, lava, water).
- The grid is the single source of truth. The renderer maps material id → palette index (per map theme) into an `ImageData` and blits it; dirty-rectangle tracking keeps the per-frame copy cheap.

### 4.2 Destruction
- Explosions carve shapes from the grid. Shape is per weapon: circle (default), horizontal ellipse (bunker buster), vertical line (digger/laser), ring, random "scatter".
- Material hardness: an explosion of radius R carves R in `DIRT`, R × 0.5 in `ROCK` (tunable), etc.

### 4.3 Falling dirt (the key feel)
- After any terrain modification, unsupported cells fall. Implement as a column-based settle pass over the dirty region: for each column, compact cells downward, or as a cellular-automaton pass with per-material rules (`SAND` can slide diagonally, `DIRT` falls straight, `ROCK` never moves).
- Falling must be animated over several ticks (not instant) so players see it, and tanks caught in or under falling dirt are affected: buried tanks take damage or are pushed; tanks on falling columns fall with them.
- Settle must be deterministic and bounded per tick (cap cells moved per tick to keep frame time stable; continue next tick).

### 4.4 Adding terrain
- Weapons like "Dirt Ball", "Dirt Clod", "Ton of Dirt" **add** material. Added dirt obeys the same settle rules (so a dirt ball on a slope flows).
- "Refill" rule: terrain may be added anywhere including on top of tanks (burying them). Buried tanks cannot fire certain weapons and must dig out (digger weapon) or be freed by other players' shots.

### 4.5 Generation
- Procedural, seeded generators (seed is shared across peers). Minimum set: rolling hills (layered noise), mountains (sharp peaks), canyon, flat with pillars, islands/caverns (overhangs allowed — the grid supports them).
- Tank placement: evenly spaced with jitter, never inside terrain, never closer than a minimum distance.
- Prop placement (§4c) runs after terrain, before tanks; tanks never spawn inside or directly under a prop.
- Map theme (colour palette, sky gradient, optional background parallax) is cosmetic and independent of the generator.

### 4a. Terrain dynamics (the successor's core mechanic)

Beyond carve/add/settle, the grid supports **bulk operations** that move existing material. These are what the signature weapons are built from, and they must be deterministic, bounded per tick, and animated (not instant).

- **Displace (shockwave)**: for every solid cell within radius R of a point, push it outward along the radial vector by a distance that falls off with range. Cells that land in air stay there; cells that collide with other solid cells pile up (settle rules then apply). Visually: a ring moves outward and the terrain bulges ahead of it, filling nearby craters and tunnels. This is the headline effect.
- **Attract (gravity well / implosion)**: the inverse — pull cells inward, forming a mound at the centre and voids around it.
- **Liquefy**: temporarily mark cells in a region as `LIQUID_DIRT`; they flow downhill with sand-like rules for N ticks, then set back to `DIRT`. Hills slump, tunnels fill, tanks on the slope slide.
- **Harden / freeze**: convert `DIRT`/`SAND` in a region to `ROCK` (or `ICE`): resists later explosions, doesn't fall.
- **Raise / lower (terraform)**: add or remove a column-wise height delta over a span, with smoothing — creates a wall or a trench.
- **Convert**: change material type in a region (e.g. to `LAVA`, which damages tanks that touch it and slowly cools to `ROCK`).
- **Burn**: `NAPALM` cells consume `DIRT` beneath them over time (shallow), leaving scorched `ASH` that is weaker.
- **Zone**: a persistent region with a per-tick rule for N ticks (projectile force field, gas cloud, slow field). Zones are the one concept added for the catalogue in §4d; the sim keeps a small list and applies them in projectile integration and settle.

Implementation notes:
- Each operation is a pure function `(grid, params, rng) → dirty rects` plus a per-tick continuation so the effect spreads over several frames (a shockwave expands ~1 radius per 3 ticks, for example).
- Cells carry only a material id; any per-cell state an effect needs (liquefy timer, lava heat) lives in a small secondary `Uint8Array` or a per-region record, not in objects.
- Tanks are affected by all of the above: pushed by shockwaves, buried by piles, slid by liquefaction, encased by freeze, damaged by lava.
- Material set for v1: `AIR, DIRT, SAND, ROCK, ICE, LAVA, ASH, LIQUID_DIRT, NAPALM, WATER`, coatings `OIL, WET, FROST`, plus prop materials (`WOOD, BRICK, GLASS, LEAF, METAL, CONCRETE`) and their broken forms (`RUBBLE, SPLINTER, SHARD`, all `fall`/`slide`); reserved ids up to 255 for later.

### 4b. Materials as content

A material is a content item (`material.*`) and every cell of the grid is one material. The material defines how the cell looks, how it moves, and how it responds to every kind of damage. This is where "strengths and weaknesses" live, so props and terrain share one rule set.

Manifest slots:
- `meta`: id, name, palette role / colour ramp, dither pattern, optional emissive (lava, energy).
- `settle`: `static` (never moves), `fall` (straight down), `slide` (diagonal, like sand), `flow` (liquid), plus `density` for stacking order when flows meet. Cells that belong to a prop group (§4c) ignore their settle rule until the group breaks.
- `strength`: a map of **damage type → resistance** in `[0, ∞)`, where 1 = baseline dirt, 0 = destroyed by any contact, >1 resists. Damage types in v1: `blast`, `kinetic` (rollers, direct hits), `heat` (napalm, lava, laser), `cold` (cryo), `shock` (shockwave displacement), `dig` (tunnelers), `corrosive` (acid, plague). Example: `GLASS` is `blast: 0.1, kinetic: 0.05, heat: 2.0`; `METAL` is `blast: 3, heat: 0.6, corrosive: 0.3`; `WOOD` is `blast: 0.8, heat: 0.1` (burns), `ICE` is `blast: 1.5, heat: 0`.
- `weakness` is just resistance < 1, but materials may also declare **triggers**: `onDamage: { heat: { convert: "material.fire", spread: 0.3 } }` — wood catches fire and fire spreads to adjacent wood; `onDamage: { blast: { shatter: true } }` — glass turns the whole connected pane into falling shards (sim particles) instead of carving a crater.
- `reactions`: adjacency rules evaluated per tick on dirty cells: `lava + ice → rock + effect.steam`, `lava + wood → fire`, `water + lava → rock`, `fire + air → ash after N ticks`.
- `cohesion`: how strongly cells of this material hold their neighbours together, in `[-1, 1]`. 0 = dirt (settles normally). Positive = binds: unsupported cells stay attached while the connected body's cohesion budget holds, overhangs survive, and displacement ops move the body as a **blob** (translate the connected group) instead of scattering cells. Negative = loosens neighbours: water and acid wash sand and ash downhill and erode dirt they flow across. Cohesion is evaluated on the connected component touched by a dirty rect, bounded per tick like settle.
- `compact`: soft materials (mud) squash instead of only blowing away. When a carve removes them, each carved column packs the cells under the crater floor into a tougher variant (`into`, e.g. `material.packed-mud`), `ratio` packed cells per carved one up to `maxDepth`, stopping at air or anything that does not compact. A blast from above leaves a shallow dent with a packed floor, and a second hit there digs less. `gen.marsh` fills hill valleys with mud.
- `coating`: a material may be a *coating* (oil, water, tar, acid, frost) rather than a bulk material. A coated cell keeps its base material in the main grid and stores the coating id in the secondary per-cell array; the coating contributes its `cohesion`, `strength` modifiers, `reactions` and shader look to the cell beneath. Coatings spread along surfaces (`spread` rule), drip (`flow`), and are consumed by reactions (oil burns away, water evaporates on heat). Renderer draws coatings as an overlay pass (sheen, wetness, frost), which is where most of the "cool shader" budget goes.
- `contact`: effect on a tank touching or buried in it: damage per turn (lava, fire), slow (sand), slide (ice), bog (tar), shield-drain (corrosive).
- `decay`: timed conversion (`fire → ash`, `lava → rock` as it cools, `liquid_dirt → dirt`).
- `ai`: value hints (cover quality, danger).

Explosions and terrain ops look up `strength[damageType]` per cell, so a nuke carves dirt, dents metal and ignores nothing by special-casing — it's all data. New damage types are added to a registry and default to resistance 1 for materials that don't mention them.

### 4c. Props: houses, trees and other placed structures

Props are the "stuff on the map" at round start — a house, a tree, a bunker, a ruin, a fence, a boulder. They are not entities with their own physics: a prop is a **multi-material stamp** that is written into the grid when the map is generated, after which it is ordinary terrain. That means every weapon, terrain op, material reaction and settle rule works on props without any special code: a shockwave pushes a house over, napalm burns the wooden parts and leaves the brick, a digger tunnels through the basement, dirt piles up against the wall.

Prop content item (`prop.*`):
- `shape`: a small material-indexed bitmap (PNG or ASCII art in the manifest, each glyph/colour mapped to a material id), or a procedural builder (`tree{height, canopy}`, `house{w, h, floors, roof}`) in TS for variety. Anchors: `base` row that must sit on the surface, `width` for spacing.
- `materials`: the materials used, by role (`wall: material.brick`, `roof: material.wood`, `window: material.glass`, `trunk: material.wood`, `leaves: material.leaf`), so a theme or variant can re-skin a prop by swapping a material (`house.stone`, `house.wood`).
- `attributes`: custom data beyond materials: `health`-style thresholds for scoring (e.g. destroying a house awards or costs points in some modes), `value`, `flammable` summary, `cover` rating for AI, `tags` (`building`, `vegetation`, `cover`, `hazard`).
- `placement`: rules for the generator — allowed terrain (`flat`, `slope<20°`), min distance from tanks, density (count or per-width probability), clustering (village of 3–5 houses), biome/theme restrictions, `anchorToSurface: true` (the prop's base is snapped to the terrain, dirt filled underneath).
- `groups`: **structural integrity**. A prop can declare one or more *groups* — named sets of its cells (`wall`, `roof`, `trunk`, `canopy`, or the whole prop) that behave as a unit rather than as independent pixels:
  - Each group has an `integrity` pool (e.g. `wall: 300`) and a `resistance` per damage type (layered on top of the materials' own). While integrity > 0, damage to any cell in the group is **absorbed by the pool**: cells are not carved, the group just gets weaker. Visual state is derived from the remaining fraction (`intact → cracked → crumbling`) via material variants (`material.brick` → `material.brick.cracked`) and effect events (dust puffs, creaks), so a player can see a building is about to go.
  - Optional `chip: 0.2`: a fraction of damage still carves cells immediately, so sustained fire visibly bites into a wall before it fails.
  - When integrity reaches 0 the group **breaks**: every remaining cell converts per the group's `breakInto` rule — e.g. `brick → material.rubble` (a `fall` material), `glass → material.shard` (sim particles that scatter), `wood → material.splinter` + `effect.wood-crack`, `canopy → material.leaf` (light, slides like sand). The converted cells then obey normal settle rules, so the structure *pours* into a heap instead of vanishing. "Takes a lot of hits, then collapses like sand" is exactly this.
  - `support`: a group can depend on another (`roof supports: [wall]`). When a supporting group breaks, or the cells under a group's `base` row are gone, the dependent group drops as a rigid block (column-translate per tick until it lands) and then either stays or breaks on impact depending on `fallDamage` vs its remaining integrity.
  - Groups are optional: a boulder can be one group with high integrity that shatters into rock chunks; a dead tree can have no groups and just be wood cells that carve normally.
  - Ordinary terrain can use groups too: a generator can wrap a rock arch or a mesa top in a group so the formation holds together under fire and then collapses dramatically.
  - Determinism: group state is part of the sim state (small per-group record: integrity, cell count, fallen), hashed with everything else.
- `effects`: optional ambient effect events while intact (chimney smoke, leaves swaying, window glow at dusk) and on destruction (`effect.collapse-dust`, `audio.wood-crack`). Effects are keyed by prop state (`intact`, `damaged`, `destroyed`), derived from the fraction of original cells remaining.
- `variants` / `extends`: `prop.house.ruined extends prop.house` with some cells pre-removed; `prop.tree.pine`, `prop.tree.oak` share a builder with parameters.

Placement is a generator responsibility: a generator manifest lists which props it may place and with what density (`gen.village = gen.hills + props: [{use: prop.house, count: 3..5, cluster: true}, {use: prop.tree, density: 0.02}]`). Game modes can override the prop set (`mode.urban`, `mode.forest`), and the lobby exposes a simple "scenery: none / light / dense" setting.

Props are placed deterministically from the map seed, are included in the content hash, and appear in captures (`scenario.props` can also place specific props at specific positions for showcases).

v1 prop set: `house` (wood/brick/stone variants; groups `wall`, `roof`, `windows`), `tree` (pine/oak/dead; groups `trunk`, `canopy`), `bunker` (concrete + metal door; one high-integrity group that breaks into rubble), `boulder` (one group → rock chunks), `fence` (no groups), `ruin` (pre-cracked groups). Later: `tower`, `bridge`, `fuel-tank` (explodes), `water` (as a prop-placed material pool).

---

## 5. Weapons and items

Design rule: every weapon is a content module per §2c — a manifest composing flight, trigger, impact, terrain-op, effect and audio behaviours from registries. Adding a weapon must not require touching the kernel; most weapons are data only.

### 5.1 Target arsenal (v1 ≥ 40 items; later ≥ 70)

**Standard explosives** — Baby Missile, Missile, Baby Nuke, Nuke, Leapfrog (bounces and explodes several times), Funky Bomb (scatters bomblets), MIRV (splits at apex), Death's Head (huge), Heavy Nuke.

**Rollers** — roll along the terrain after landing until they hit a tank or a wall; Baby Roller, Roller, Heavy Roller.

**Diggers / tunnelers** — carve through terrain without exploding until they exit or time out; Baby Digger, Digger, Heavy Digger, Sandhog (digs then explodes).

**Terrain adders** — Dirt Clod, Dirt Ball, Ton of Dirt, Liquid Dirt (flows and settles like sand), Dirt Charge (adds a column under the impact point).

**Napalm family** — fire particles that flow downhill and burn for several ticks, damaging tanks they touch; Napalm, Hot Napalm, Plasma Blast.

**Lasers / beams** — instant straight line, ignores gravity and wind, limited range, cuts a thin channel; Laser, Heavy Laser.

**Guided** — Tracer (no damage, shows trajectory), Smart Bomb (mild homing toward nearest tank), Heat Seeker (strong homing).

**Weird** — Riot Charge / Riot Blast / Riot Bomb (clear terrain without damaging tanks), Earthquake (shakes all tanks loose, drops terrain), Lightning (strikes highest tank), Mystery (random weapon on fire), Plague (slow damage over turns).

**Signature (terrain-dynamics) weapons — the reason to play this and not the original**
- **Shockwave**: no crater; a ring that displaces terrain outward from the impact, filling craters, burying nearby tanks, shoving tanks sideways (fall damage if pushed off a ledge). Baby / standard / Heavy variants scale radius and push distance.
- **Implosion**: pulls terrain (and tanks) toward the point, leaving a mound with a tank on top — exposed to everyone.
- **Quicksand**: liquefies a region; the hill slumps and anything on it slides to the bottom.
- **Cryo Shell**: freezes a region to ice/rock — defensive bunker, or trap a tank in a block it can't drive out of.
- **Terraformer**: raises a wall between you and the shooter, or lowers a trench to drop an enemy into.
- **Magma Bomb**: converts terrain to lava that flows downhill and cools over turns; standing in it hurts every turn.
- **Tectonic Charge**: a horizontal shockwave along the surface — a wave of dirt travels across the map.
- **Singularity** (late-game, expensive): implodes, then explodes — gathers the terrain then blasts it outward.
- **Resonator**: harmless on impact, but the *next* explosion within its radius has its shockwave doubled.
- **Incendiary**: low blast, high `heat` — barely scratches dirt, but sets every wooden prop in range ablaze and the fire spreads.
- **Acid Rain**: `corrosive` cloud that eats metal and brick over several turns while leaving dirt alone — strips a bunker.
- **Oil Slick** (★ v1): coats a region in oil — holds the hill together against the next shockwave, bogs nothing, but one spark later and the whole slope is on fire. Pairs with Incendiary.
- **Flood** (★ v1): dumps water that washes sand and ash downhill, erodes dirt, douses fires and quenches lava — a counter to the heat weapons and the way to wash a dune out from under a camper. See the worked example in §4d.
- **Water Cannon**: a `beam`-flight stream of water — no blast, pure wash; sustained-fire variant for sculpting.
- **Vortex Shell**, **Levitator**, **Crystal Seed**: see §4d catalogue — post-v1.

**Defensive / utility items** — Shield, Deflector Shield (bounces projectiles), Mag Deflector (repels), Heavy Shield, Parachute (auto-deploys on fall), Battery (restores health), Auto Defense (auto shield when hit), Fuel Tank, Tracer, Triple Turret (fire three at offset angles).
- Implemented (core@0.18.0, `gear.*` content type, kept in its own inventory): Shield (raises the shield to 50, $2000), Heavy Shield (to 100, $5000), Battery (+30 health up to the round-start health, $1500) are switched on while aiming and never end the turn, and are refused when they would change nothing; Parachute ($800 for 2) opens by itself when a fall would hurt, the tank drifts down at 1 cell/tick and lands unhurt (falling off the map is still fatal). Fixed prices, carry limits per item. Bots buy gear by personality (`gear` plan in each `ai.*` manifest) and switch shields/batteries on before their shot.

Each weapon manifest fills the slots in §2c.2. The lists above are a target catalogue, not a class hierarchy — many are the same behaviours with different parameters.

### 5.2 Weapon effects
- Each weapon declares an *effect profile* (shockwave ripple strength, flash colour, particle burst spec, haze, palette cycle) consumed by the renderer's effect passes. Weapons in the same class share profiles with parameters, so adding one is data, not shader work.
- Debris that *lands* becomes terrain and is therefore part of the deterministic sim; cosmetic GPU particles and post-process filters are not, and must be droppable (quality setting, or a peer that lags) without affecting determinism.
- A **quality setting** (low / medium / high) scales particle counts and disables the heaviest filters; mobile defaults to medium, low must still look good.

---

## 6. Networking

### 6.1 Requirements
- Players connect over the internet from different networks.
- Public games: anyone can browse and join.
- Private games: joinable only with a code/link.
- Up to 4 players in v1 (host holds ≤3 connections); up to 8 from milestone 7 (≤7 connections). Latency tolerance is high (turn-based), but turn resolution must appear within ~1 s for everyone.
- Mobile networks: connections must survive a brief interruption (screen lock, app switch, cell/Wi-Fi handover). Inputs are buffered and re-sent; a peer gets ~20 s to reconnect before AI takeover.
- Zero-cost hosting.
- Graceful disconnect: a disconnected human is replaced by an AI for the rest of the round, with a rejoin window (host setting).

### 6.2 Topology
- **Peer-to-peer over WebRTC data channels, host-authoritative.** The player who created the lobby is the host. All other peers connect to the host (star topology; 3 connections max for the host in v1, 7 later). Host relays nothing — because the simulation is deterministic, each peer only needs each player's *inputs*.
- A signalling server is required only to exchange SDP offers/answers and ICE candidates and to list public games. Once a match starts it can be ignored (keep the socket for reconnects).
- **Server-less fallback ("direct contact")**: a mode where signalling happens by copy-paste. Host generates an offer string, shares it on any channel (Discord, SMS), joiner pastes it and returns an answer string. This works with no backend at all and must be supported for 1v1 (and ideally more).

### 6.3 Deterministic lockstep
- Game state advances only via `applyInput(playerId, input)` and `tick()`. Inputs are: move, weapon select, angle, power, fire, shop purchases, ready.
- Each turn's resolution is simulated identically on every peer from the same seed and the same input sequence. Peers exchange only inputs, plus a periodic state hash for desync detection.
- Determinism constraints (enforced by lint rule / review):
  - No `Math.random` in `packages/sim`; use a seeded PRNG (e.g. mulberry32 / xoshiro) owned by the match state.
  - No floating-point transcendental functions whose results may differ across engines in the hot path (`Math.sin/cos/atan2/pow`); use fixed-point integer math or lookup tables for trajectories, or document and test that all supported browsers agree. **Preferred: integer/fixed-point for anything that touches the terrain grid.**
  - No iteration over `Map`/`Set`/object keys where order is not guaranteed to be identical.
  - No wall-clock time in the simulation.
- On desync (hash mismatch): host's state is authoritative; host sends a full state snapshot, peers re-sync.

### 6.4 NAT traversal
- Use public STUN (e.g. Google's) by default; configurable list.
- TURN is needed for symmetric-NAT cases. **With mobile as a launch requirement this is not a corner case** — carrier-grade NAT on cellular makes direct P2P fail often. Free TURN is the one genuinely hard part of the zero-cost goal. Options, in order of preference:
  1. Attempt direct P2P via STUN.
  2. **Automatic WebSocket relay through the signalling server** if the data channel isn't open within ~5 s. This is the baseline guarantee that any two phones can play; input traffic is tiny so it fits a free tier. The relay must be transparent to the game layer (same message interface as the data channel).
  3. TURN (`coturn` on a free container with UDP, or a low-quota hosted TURN) as an optimisation later, if relay load becomes a problem.
- Measure and log which path each session ended up on so the TURN decision is data-driven.

### 6.5 Lobby protocol (signalling server)
- WebSocket, JSON messages, typed with Zod schemas shared from `packages/shared`.
- Messages: `createRoom`, `listRooms`, `joinRoom(code)`, `leaveRoom`, `offer/answer/ice` relays, `roomUpdate` broadcast, `startMatch`.
- Rooms live in memory with a TTL; a DB is not required unless the server needs to survive restarts (free tiers restart/spin down — see §7).
- Private rooms have a 6-character code; public rooms are listed with name, player count, settings summary and host region.
- Rate limiting and basic abuse protection on room creation.

---

## 7. Infrastructure (free tier)

- **Static client**: any static host (Render static site, Cloudflare Pages, GitHub Pages, Netlify). Must be served over HTTPS (WebRTC requires a secure context).
- **Signalling server**: Render.com free web service (Node). Known constraints to design for:
  - Free services spin down after inactivity and take tens of seconds to cold-start. The client must show a "waking up the lobby server…" state and retry, and the server-less copy-paste mode must remain usable as a bypass.
  - In-memory rooms are lost on restart; acceptable for v1.
  - Verify that the chosen free tier allows persistent WebSocket connections and what the monthly hour cap is; fall back to Fly.io / Cloudflare Workers + Durable Objects if Render's limits don't fit.
- **Database** (optional, later): Render Postgres free tier, Neon, or Supabase — only for persistent public-room listing, match history, or stats. Not in v1.
- **TURN**: see §6.4. Milestone 5 decision: no TURN yet; the WebSocket relay carries every link that P2P can't, and `GET /stats` tracks relay share and relay bytes per minute. Thresholds for revisiting are in ARCHITECTURE §7.2.
- All secrets/config via environment variables; one `pnpm dev` command for the full local stack (no Docker required — cloud agent sessions may not have it).
- **Development environment**: the project is built primarily by coding agents in cloud sessions (Linux container, no GPU, no display, Node + pnpm + Playwright/Chromium available, outbound network limited to package registries and GitHub). Everything in the dev workflow — tests, content validation, capture, build — must run there with no extra setup beyond `pnpm install`. Anything that needs a browser uses headless Chromium; anything that needs a GPU is out of the dev loop.
- **Deploy previews**: pushes to a branch deploy the static client to a preview URL (Cloudflare Pages / Netlify / Render static) so the owner can try a build on a real phone by opening a link. The signalling server gets a preview environment on Render per PR where the free tier allows, else a single shared `staging` service.

---

## 8. Client UX

- Screens: Title → (Local play | Host online | Join online | Browse public) → Lobby (settings, player slots, bots, ready-up) → Match (HUD) → Shop → Scoreboard.
- HUD: wind indicator, current player, angle/power readouts, weapon selector with counts, health bars over tanks, turn timer, chat (text) during online play.
- Camera: per-client zoom and pan (§2a), default fits the whole map; "fit" button; no automatic follow during shots.
- Replay of the last shot (local, from inputs — free thanks to determinism).
- Desktop: keyboard with full mouse support, all bindings rebindable. Mobile: see §8a.
- Connection flow on mobile must be short: open link → enter name → you're in the lobby. Private-game invites are shareable links (Web Share API where available) that deep-link straight into the room.
- Settings persisted in `localStorage` (volume, bindings, cosmetic options).
- Accessibility: colour-blind-safe tank colours (or patterns), scalable UI, no information conveyed by colour alone.
- Audio: Web Audio API; distinct sounds per weapon class; muteable. On mobile, audio is unlocked on the first tap (autoplay policy) and respects the silent switch where the platform exposes it. All audio is chiptune; see §8b.

---

## 8b. Audio: chiptune only

All audio — music, ambience and sound effects — is made in a chiptune / tracker style. No recorded or sampled real-world audio, no streamed MP3/OGG soundtracks.

- **Music and ambience** are tracker modules (MOD/XM/S3M/IT), played in the browser by a module player such as [`chiptune3`](https://www.npmjs.com/package/chiptune3) (libopenmpt in an AudioWorklet, MIT). `chiptune3` is the example and current front-runner, not a hard pick; any equivalent tracker-module player is acceptable if it meets the constraints below.
- **Sound effects** are chiptune too: either short tracker modules / module instruments played through the same player, or synthesised at runtime with Web Audio oscillators and noise (square, triangle, saw, noise channels, simple envelopes). Decide in milestone 6 with a quick spike of both; mixing the two is fine as long as everything sounds like it belongs to one chip.
- **Audio is content.** `audio.*` items (§2c.3) reference a module file (plus optional order/pattern range or instrument) or a synth patch described as data. Weapons reference audio profiles by id and override, like everything else.
- **Original only.** Every module and patch is original or properly licensed for redistribution, with its licence recorded in the manifest. No ripped modules from other games.
- **Constraints**: lazy-loaded (not in the initial bundle budget of §9); the player's WASM/worklet must work on the reference phones (iOS Safari AudioWorklet in particular) and be unlocked on first tap; audio never runs in `sim`, it is driven by effect/audio events from the render snapshot, so a muted or audio-less peer stays deterministic.
- Headless capture (§2d) may render module audio offline into MP4 when `--audio` is passed.

---

## 8a. Mobile and touch

Mobile is a launch platform, not a port. Everything in the match screen must be operable one-handed on a ~6" phone.

- **Layout**: landscape primary — map on top, control bar below (or right-hand side on very wide screens). Portrait supported: map letterboxed at the top, large control area beneath. Safe-area insets respected (notch, home indicator).
- **Aiming**: drag anywhere on the map to set angle and power together (drag direction = angle, drag length = power, like a slingshot, with a preview line); tap-and-hold a tank to fine-tune. Also provide ± steppers for angle and power for precision play. Last-used settings persist between turns.
- **Weapon selection**: horizontal scrollable strip above the fire button showing icon + count; tap to select, long-press for description.
- **Fire**: one large thumb-reachable button. No accidental fires: a shot needs a deliberate tap on the fire button, never a release of the aiming drag.
- **Movement**: left/right buttons appear only when fuel is available.
- **Hit targets** ≥ 44 px CSS. No hover-only information anywhere.
- **Shop**: card grid with large buy buttons; works with a thumb; timer visible.
- **Lobby/menus**: single-column, full-width buttons, no modal stacking.
- **Reference devices**: Samsung Galaxy S23+ (Android, Chrome) and iPhone 14 (iOS 16+, Safari) are the primary mobile test devices — both must run at a locked 60 fps on "medium" with *all* v1 sim features on (coatings, blob displacement, groups, props), and should handle "high". A 3-year-old mid-range Android phone is the floor at "low". Browser support is Baseline 2026 (§9); both reference phones are comfortably inside it. Note the S23+ has a 120 Hz display: the render loop must cope with `requestAnimationFrame` at 120 Hz without the fixed-step sim running fast (accumulator pattern). Battery: no rendering while waiting in the lobby, `requestAnimationFrame` paused when the tab is hidden.
- **Lifecycle**: the game survives screen lock and app switching — on `visibilitychange` the client re-syncs state from the host (deterministic replay of missed inputs) rather than dropping.
- **PWA**: installable (manifest + service worker for the static client), works offline for local vs-AI play. Not an app-store app.
- **Testing**: Playwright device emulation for layout; real-device smoke test on the S23+ (Chrome) and at least one iOS Safari device before each milestone is called done.

---

## 9. Non-functional requirements

- `pnpm capture` of a 5 s scenario completes in ≤ 15 s; visual regression suite over all reference scenarios runs in CI in ≤ 5 min.
- 60 fps on a Medium map (1200×600) on a mid-range laptop at "high", on a Galaxy S23+ and iPhone 14 at "medium" (target: also "high"), and on a Small map on a 3-year-old mid-range Android phone at "low", with a full-screen shockwave filter + 2,000 GPU particles active, at any zoom level. Terrain texture upload per tick must stay under 1 ms (dirty-rect sub-uploads). Large maps on the reference phones are gated on the benchmark.
- **Sim tick budget on the reference phones**: ≤ 2 ms average, ≤ 6 ms worst case, measured in-browser on the S23+ and iPhone 14 (not on a laptop) on a Medium map for the worst scenario in the suite: a Heavy Shockwave into an oil-coated dune with a grouped house on it, water pooled below, 4 tanks. Frame budget split: sim ≤ 6 ms, renderer ≤ 6 ms, headroom 4 ms. Budget is enforced in CI on x86 with a 3× safety factor (x86 CI must stay ≤ 2 ms worst case) since the cloud agent has no phone.
- **Sim implementation rules that keep it there** (enforced by review and lint where possible): the grid and all secondary layers are typed arrays, never arrays of objects; connected-component / flood-fill work uses a preallocated `Int32Array` queue and `Uint8Array` visited mask, no `Set`/`Map`, no per-cell allocation; every op is bounded by its dirty region, never the full grid; ops spanning many cells are spread over ticks (shockwave expands ~1 radius per 3 ticks); settle and cohesion run only on dirty rects; no closures or `forEach` in hot loops. Reference numbers for sanity: a full 1200×600 pass over a `Uint8Array` is ~1–1.5 ms on these phones (and ops never touch the full grid); a 25k-cell flood fill is ~0.3 ms; so blob displacement of a radius-90 shockwave is ~1 ms total spread across 3 ticks — comfortably inside budget when written this way, and 50× over it if written with objects.
- **Benchmark suite** (`pnpm bench`, run in CI and reported in every PR that touches `sim` or `content`): settle on a dirty 200×100 region; carve r=60; displace r=90 plain dirt; displace r=90 with 30% oil coating (blob path); flood-dune scenario 120 ticks; house collapse; 4-bot full round. Each has a committed baseline; a >15% regression fails the PR. The agent attaches the bench table alongside the capture GIF.
- Initial bundle ≤ 700 kB gzipped including Pixi (mobile data); code-split the shop/lobby from the match renderer; shaders inlined as strings.
- **Browser support target: Baseline 2026** (web-platform features available in all core browsers for ≥ 30 months as of 2026). Set `browserslist` to `baseline 2026` (or the equivalent `baseline widely available` query, with the year pinned) and let it drive Vite/esbuild targets and lint rules for unsupported APIs. Anything in Baseline 2026 may be used freely with no polyfill or feature check; anything newer (WebGPU, newer WebRTC APIs, etc.) is optional enhancement behind a runtime check with a Baseline fallback. WebGL2 is the rendering floor. WebRTC quirks per browser documented (iOS Safari data-channel behaviour and background-tab handling in particular).
- The simulation package has ≥ 80% test coverage, including golden-file tests: a recorded seed + input log must produce an identical state hash across runs and across CI machines.
- No analytics, no tracking, no third-party scripts beyond STUN/TURN.
- Original art and names only (see §1 non-goals).

---

## 10. Repository layout

```
/
  packages/
    shared/     # types, zod schemas (manifests, net protocol), constants, effect-event types
    sim/        # deterministic KERNEL: grid, tick loop, PRNG, registries, entity store, replay. No content, no DOM, no React.
    content/    # content packs; one folder per item
      core/
        weapons/<id>/      manifest.json, behaviour.ts (optional), <id>.test.ts
        materials/<id>/
        props/<id>/        manifest.json + shape.png or builder.ts
        generators/<id>/
        terrainops/<id>/
        ai/<id>/
        modes/<id>/
        themes/<id>/
        effects/<id>/      renderer-side implementations keyed by renderer
        audio/<id>/
        pack.json          { name, version, schemaVersion, items[] }
    client/     # Vite + React. render/pixel (Pixi) behind a Renderer interface, effect shaders, GPU particles, HUD, menus, WebRTC client, audio.
    capture/    # headless capture CLI (§2d): scenario runner, Playwright harness, ffmpeg encode, visual diff
  scenarios/    # data-driven capture scenarios, one per content item + presets
  captures/     # gitignored output; captures/reference/ holds regression baselines
    signal/     # Node WebSocket signalling + public room list.
  docs/
    REQUIREMENTS.md   # this file
    ARCHITECTURE.md   # to be written: data flow, determinism rules, net protocol
    WEAPONS.md        # GENERATED from manifests
    CONTENT.md        # how to add a weapon/material/mode; the §2c rules in detail
  CLAUDE.md           # project conventions for Claude Code
```

Suggested `CLAUDE.md` rules: browser target is Baseline 2026 — use any Baseline feature without polyfills or feature-detection, and gate anything newer behind a runtime check with a fallback; for any change to a weapon, explosion, terrain op, effect, theme or the renderer, run `pnpm capture` on the relevant scenario and send the GIF/MP4 (and `--sheet` PNG) with a one-line approve/refuse question before calling the task done; never claim a device-dependent result (real-phone fps, touch feel, NAT traversal) — tag it `needs-device` and provide the preview URL instead; strict TS; no `any`; `sim` and `content` packages must stay free of `Math.random`, `Date`, DOM and React; the kernel never imports content; new behaviour goes in a content module under a new id, never as a special case in the kernel; every content item ships with a manifest, a test and passes `pnpm content:validate`; never change what an existing id does within a released pack version; run `pnpm test` before claiming a task done.

---

## 11. Milestones

0. **Bootstrap** — monorepo, lint/test/CI, `pnpm dev`, headless Chromium + SwiftShader smoke test (a WebGL2 triangle rendered and screenshotted in the container), ffmpeg check, deploy-preview pipeline for the static client. Proves the cloud dev loop before any game code.
1. **Kernel + content pipeline (no rendering)** — terrain grid, settle, projectile integration, PRNG, registries, `pnpm bench` with baselines from the start, manifest schemas + validation, content loader (`import.meta.glob`), `pnpm content:new`; reference/`extends` resolution; first content: `material.dirt/rock/sand` with `strength` per damage type, `gen.hills`, `flight.ballistic`, `explosion.standard`, `explosion.shockwave`, `terrainop.carve/add/displace`, `weapon.missile`, `weapon.baby-missile` (proving override-only weapons), `weapon.shockwave`, `mode.classic`. Deterministic golden tests and content hash.
2. **Rendering + touch + sandbox + capture** — `Renderer` interface + render snapshot (§2b); Pixi pixel renderer: terrain texture + palette shader, sprites, trails, first effect pass (shockwave ripple filter + particle burst), quality setting, HUD, slingshot touch aiming and desktop controls; the dev content sandbox (§2c.5); the headless capture CLI (§2d) with the `weapon-showcase` preset working end-to-end to GIF and MP4. From this milestone on, every visual change is reviewed via capture. Local hot-seat 2-player match playable on a phone and a laptop.
3. **Full game loop** — rounds, sudden death, scoring, shop, 15+ weapons including 4 signature terrain-dynamics weapons (Shockwave, Quicksand, Terraformer, Magma Bomb), remaining terrain ops, prop system with groups/integrity (absorb → crack → collapse into rubble), `house`, `tree`, `boulder`, the `wood/brick/glass` materials with reactions (fire spread, glass shatter), `gen.village`, coatings with `oil` and `water` (cohesion, blob displacement, fire spread, wash/erode) and the Oil Slick + Flood weapons, 3 AI personalities, settings screen. Playtest to confirm a 4-player, 3-round match lands in 5–10 minutes; tune timers/turn caps.
4. **Networking** — signalling server on Render, WebRTC star topology with automatic WebSocket relay fallback, lockstep inputs, desync detection, content-hash check and protocol versioning, private rooms with share links, mobile reconnect. Copy-paste server-less mode.
5. **Public games + resilience** — public listing, AI takeover, PWA install, TURN decision from relay metrics.
6. **Arsenal + polish** — 40+ weapons (mostly data-only, proving the pipeline), all signature weapons, remaining AI personalities, full effect library (haze, bloom, palette cycling, sky reaction), chiptune audio (§8b), themes with ambient effects, accessibility pass, performance budget verification on real devices.
7. **Later** — raise player cap to 8, team play, longer match presets. Possible experiment: a voxel renderer behind the §2b interface.

---

## 12. Open questions

- ~~PixiJS v8 vs. raw WebGL2~~ — **decided in milestone 2: raw WebGL2** (see ARCHITECTURE §5). The whole pipeline is one palette shader, one instanced quad batch and one post pass; Pixi's ~150 kB bought nothing we use, and owning the GL keeps captures byte-identical under SwiftShader. Revisit if the milestone-6 effect library outgrows hand-written passes.
- How far to push "data only": a tiny expression language in manifests (e.g. damage as a function of range) vs. always dropping to TS for anything non-trivial. Lean TS — it's typed and testable.
- Whether community content packs (user-authored, loaded at runtime) are a goal. If yes, manifests must be sandboxed (data only, no TS) — decide before the schema hardens.
- Group falls are straight-down in v1. Toppling/rotation (a tree falling sideways, a wall keeling over) would be a visible win but needs a small rigid-body step — spike after milestone 3.
- Cohesion/blob displacement is the sim feature most sensitive to implementation quality (connected-component work per tick). It is well within budget when written with typed arrays and a bounded flood fill (§9 numbers); it blows the budget 50× if written naively. Milestone 1 implements it against the `pnpm bench` baseline on day one; the fallback (cohesion affects settle only, displacement stays per-cell) exists only if the benchmark cannot be met on the reference phones after a proper implementation.
- Integrity numbers are the main balance lever for props; the content sandbox should expose a "hit this prop with weapon X until it breaks" scenario so values can be tuned by watching captures.
- Whether prop destruction should matter for scoring in the default mode (reward, penalty, or neutral). Neutral until playtested.
- How the AI should value terrain-dynamics weapons (a shockwave that buries three tanks is worth more than its damage number). Needs a heuristic beyond expected damage.
- Fixed-point everywhere vs. "float but verified across browsers" for the trajectory integrator — decide in milestone 1 after a cross-browser determinism test.
- Map size presets are a first guess; tune in milestone 3 playtesting (shot travel time, tank spacing, how many props fit). Confirm that Medium at k=1 is legible on the S23+/iPhone 14 at "fit" zoom, else make the mobile default Small.
- Whether the AI should get any benefit/penalty from zoom (it shouldn't — AI aims in map coordinates; note for clarity).
- Simultaneous-fire turn mode would roughly halve round length and suits mobile attention spans — consider making it the default after playtesting.
- How retro-flavoured the React UI should be (monospace/boxy vs plain modern). Decide with a quick mockup of the shop screen.
- Team play (2v2) — in scope for v1 or v2? Resolved: added in milestone 7 (`mode.teams`, up to 4 teams, `WorldOptions.teams`).
- Whether the host should also be able to run as a headless Node process (dedicated host) later, which the sim-package isolation makes possible.
- Which free host actually supports long-lived WebSockets + UDP (for TURN) today — verify before milestone 4.
