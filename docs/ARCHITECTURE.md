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

### 3.2a Match loop (milestone 3)

A `World` is a whole match. Phases: `aim` → `resolve` → (next turn | round end) → `shop` → next
round on a freshly generated map → … → `over`. Money, score and inventory persist across rounds;
health and position reset. Everything is tick-driven so peers stay in lockstep: the turn timer
auto-fires, the shop timer auto-readies, and sudden death (`mode.suddenDeath`) scales weapon
damage and removes `edgeCells` columns at each edge at the start of every turn once it applies.
Setup-screen choices reach the sim only as `WorldOptions.rules` and `WorldOptions.bots`.

Tank types are `tank.*` content (data only): `WorldOptions.tanks` gives each player a type id,
`'random'` (drawn from a PRNG seeded off the match seed, never the match RNG) or `'auto'` (the
bot's `ai.*` `tank` favourite); unset falls back to the mode's `tank`, else the built-in
`STANDARD_TANK`. Each `Tank` carries its own hitbox (`w`/`half`/`h`), `maxHealth` and `shield`
(hashed). `damageTank` drains the shield first unless `pierce` (falling out of the map), shells
scale by the owner's `damage` percent (death blasts don't), and launch speed by `muzzle` percent.
Driving is the `drive` input (dir −1/0/1) on the active human tank during `aim`: `driveStep` moves
one cell per `mode.drive.ticksPerCell`, climbs ≤ `drive.climb`, and spends `driveLeft` (reset in
`beginTurn` to `driveCells`); `fire` stops it. `driveLeft`/`driving` are hashed.

AI players are `ai.*` content (behaviour kind `ai`). When a bot is up the kernel waits
`BOT_THINK_TICKS`, calls `aim(AiApi)` halfway through and fires at the end; in the shop it calls
`shop(AiShopApi)` and validates each purchase like a human's. `AiApi.predict` runs the weapon's
own flight behaviour and the kernel's tracer against the current terrain (no side effects), so
solvers like `ai.poolshark` account for wind and terrain exactly. Bot memory is a hashed `number[]`.
Bots drive (kernel 0.7.0): a few ticks into the think time the kernel calls the optional
`move(AiApi)`, which returns a column from `AiApi.reach(dir)` (a side-effect-free dry run of the
drive rules, limited by allowance and fuel and stopping before any drop that would cause fall damage); the kernel then drives
there cell by cell exactly like a held drive button (`Tank.botGoal`, hashed) and the think countdown
resumes once it stops. `predict(…, from)` simulates a shot from a reachable spot, and applies the
frost power cap. In the shop a purchase with `item: AI_FUEL` buys fuel packs via `buyFuel`.

### 3.2b Reactions and decay (milestone 3)

**Momentum** (`settle.ts`): a material with `glide` keeps its motion in the cell's `fallVel` byte
(low nibble fall speed, bits 4-6 slide speed, bit 7 heading left; hashed, no extra layer). A slide
speeds up on a slope steeper than 45 degrees, loses speed on one at 45 and on the level, and drifts
on when it runs off a ledge. A landing at fall speed 3 or more turns into a slide; at 6 or more the
grain is shaken loose, grains inside the landing mass are pressed toward the nearer open side and
wait behind the ones ahead, and some edge grains bounce off as debris. Coasting grains never loosen
the ground they pass, so every slide dies out and the turn can end.

**Falling pieces** (`chunks.ts`, `Chunker`): static ground that comes loose in live play leaves the
grid as rigid pieces instead of single cells. Two sources: the support pass (cells that hang too
far, split into blocks of about 18 by 13; only blocks with two cells of air under them, so a landed
piece is never taken again where it lies) and prop groups with `tumble` (the whole group on a
break, or the part of a `local` group that was cut off, in slabs of about 28 by 20, with what rests
on it; these carry the group's `breakInto`, and a piece that fell keeps its material where it lands
unless it is smaller than 40 cells, so slabs lie as slabs and only crumbs become rubble). A `tumble`
group with `local` glue also snaps under its own weight (`Groups.snap`): the hold-on flood is breadth
first, so every cell knows its distance from what holds the group, and the stone beyond a distance
falls when its weight times its overhang passes `SNAP_BEND` times the square of the cells at that
distance, or its weight alone `SNAP_LOAD` times them. A piece has a
centre, velocity, angle and spin in fixed point. In the air it falls and turns, checking only its
outline cells against the grid (liquid, gas and loose grains in the air don't stop it). On the
ground it turns about the outermost cell that holds it on the side its weight is, which makes it
tip and roll, and it is written back as terrain once its weight is over what holds it. A hard
landing knocks crumbs off as debris. Pieces are not in the grid while they move: the snapshot
appends their cells to the debris view (`debris.rigid` is the first of them). Pieces are hashed
and the turn waits for them.

**Crush** (`World.stepCrush`): what comes down on a tank hurts it. Each tick the blow on a tank is
the sum over what enters its box of density times speed squared: loose cells falling in the grid
(speed 5 or more, counted in the tick they enter), thrown grains (1.5 cells a tick or more) and
rigid pieces (`Chunker.strike`, once per piece and tank, all its cells, sixteen times over). Damage
is the blow times the mode's `fallDamage.perCell` over `CRUSH_BLOW`, at most 25 a tick, credited to
the shooter; a tick worth less than two points does nothing, so drizzle and short drops only bury.

`reactions.ts` runs after settle, over the **react region**: a box the grid grows whenever
`markDirty` touches cells, a moved cell is active, or debris of an active material lands.
`MaterialTable.active` flags materials (and coatings) that need it: `reactions` (per-tick chance
of turning into `into` and the neighbour into `other`, with an optional `spawn` into adjacent
air), tick `decay`, and `spread` (flow ageing that limits how far lava creeps). Cells still alive
re-extend the region by one cell, so it shrinks to nothing once everything is inert and `quiet`
can end the turn. Turn `decay` (lava → rock after N turns) is applied at `endTurn` over a separate
turn region; `cellState` holds age (low 6 bits) and turns (high 2 bits). Randomness is an integer
hash of (cell, tick, k), not the match PRNG, so the pass order never shifts other rolls. When the
shot is quiet, `contact.damage` materials (lava, napalm) under or beside a tank hurt it once.

Coatings react too: a coating's reactions look at all 8 neighbours and also match a neighbour's
coating, so fire runs along an oil film (oil → `burning-oil`, which spawns `fire` into air above and
wears off). Coatings with tick `decay` wear off with chance 1/ticks per tick. The roll is a murmur3
finaliser of (cell, tick, k); a plain multiplicative hash correlated across cells on one tick and
broke ignition chains.

Reactions are a pair table (`MaterialTable.pairRule`, one `Uint16` per cell × neighbour pair). A
rule's `with` may be a material id or a `#tag` (materials carry `tags` such as `burns`, `hot`,
`wet`); tags are expanded into the table at load, an id rule beats a tag rule for the same pair, and
a tag never matches its own material. Each neighbour with a rule rolls its own chance and the first
hit reacts, except that a spawn-only rule (fire throwing flames) fires at most once per tick and
does not stop the cell's other reactions.

**Gas** (`sim/src/gas.ts`, Noita feel, docs/NOITA-FEEL.md): materials with `settle: "gas"` live in a
separate `Grid.gas` layer, only over air cells, so everything that treats air as empty (shells,
tanks, settle, ops) passes through them. `gasStep` runs after `reactStep` over the gas region:
each cell may end (its tick `decay` is a mean lifetime, chance 1/ticks per tick, with an optional
`detonate`), react with its neighbours through the pair table (marsh gas + `#hot` → gas flare),
then drift sideways with the wind, rise (`lift` 1, chance `rise`) or sink (`lift` -1), diagonally
when blocked, and bubble up through liquids by trading places. Settling terrain that falls into gas
pushes the gas up into the cell it left. Reactions place a gas result through `place()`, which
writes the gas layer instead of the terrain. Gas never holds a turn (`quiet` ignores it), it is
hashed, and the snapshot carries `gas` plus a `gasRect` (where gas is plus where it was) that the
renderer re-uploads to an `R8UI` texture and draws per cell with the material's look and `cover`
as an ordered dither. `terrainop.gas-cloud` releases a cloud.

### 3.2c Props and integrity groups (milestone 3)

A `prop` item (`house`, `tree`, `boulder`) is an ASCII `shape` with a legend mapping characters to
roles, roles to materials, and `groups` of roles with `integrity`, per-damage-type `resistance`,
`breakInto`, an optional `crack` material and `supports`. `Groups` (`sim/src/groups.ts`) owns up to
255 group slots; the grid stores the slot per cell (`group`) and the intended material (`groupMat`).
Generators place props with `props: [{prop, count, cluster}]` (`gen.village`), and scenarios with
`props: [{prop, x}]`; the base sits at the median ground height (foundation fill below, cut above).

Group cells are rigid: settle and cohesive flood fills skip them, and `launch()` refuses them. After
each op the world runs `groups.guard`: every group cell the op changed (seen inside the grid's
watch box) is charged to integrity, divided by the group's resistance for the op's damage type, and
restored. Cracks show at ⅔ and ⅓ integrity; at 0 the group breaks into `breakInto` and loose
settling takes over, and groups it `supports` (windows, roof on walls) break with it. Cells that a
reaction consumes leave the group (`leaveGroup`); losing half its cells breaks a group. While the
grid is settling, `checkBases` drops a group with nothing under its base as a rigid block (landing
damage grows with the fall) and breaks a wide group whose base has lost most support. It then
runs `structure` (§4c): footing columns that stand vs hang, a reach from the base materials'
`span` shortened by weight per column, and a `tear` that releases what sticks out too far (plus
what rests on it) along a ragged line, or a whole break when the weight centre leaves the footing.

Terrain structure (§4b, `sim/src/support.ts`): the grid keeps a _structure box_ of everything that
changed or moved (`markDirty`, settle moves). Once the world is quiet, `supportPass` runs over that
box plus `MAX_REACH` either side: a column pass marks grounded cells (a solid stack to the floor,
prop groups, static materials without `span`), a breadth-first search through hanging cells gives
each its distance to support, and static cells with a `span` further away than their reach (span ×
thickness / 8, capped) are spawned as zero-velocity debris of their own material. World creation
repeats the pass over the whole map until nothing is left hanging.

`placement.roughen` wears a copy's outline (outline cells chip off, bumps grow on flat tops, then
needles are trimmed) and `mirror` flips it, both from the match PRNG, so rock formations differ per
map; with neither set no PRNG is drawn. A `shelter` prop (`rock-arch`, `rock-ledge`) may stand over
a tank spawn when the tank fits its opening (bottom `SHELTER_ROWS` rows free); placement tries to
cover a spawn first, `placeAt` puts the opening over the given column, and round-start tanks rest
on the highest non-group cell, i.e. the ground under the roof.

Groups have a `glue`. `whole` (houses, trees, boulder) works as above. `local` (rock formations) is
glued only until hit: `guardLocal` keeps what the op did to the cells it changed, frees group cells
within `loosen` of them as `breakInto`, and `launch` lets their cells fly. Then `holdOn` floods the
group from cells that hold on to something (anything solid under them, or static terrain or
another group beside or above) and frees every cell the flood misses, so a cut-off roof or shelf
falls as rubble. Because what held a piece may itself be loose rubble, flagged groups are flooded
again every tick while the grid settles. `placement.embed` sinks a prop's root into a slope that
falls away under the rest (`rock-outcrop`), with no levelling.

A `local` group with `shield` > 0 blocks blasts. Before each op call `shieldBegin` snapshots the
cells in reach; afterwards `shieldEnd` restores any changed cell whose straight line from the
blast centre crosses `shield` intact group cells, or that is ground with the group's rock within
`shield` rows above it (a blast can't undercut the rock). `launch` refuses the same cells, and
`explode` skips tanks behind that much rock. Rock formations are drawn as low-poly facets in
`material.rock-lit` / `rock` / `rock-shade`, which behave exactly like rock.

### 3.2d Flights, child shells and zones (milestone 6)

The arsenal (§5.1) needs shells that do more than fly an arc and go off, without the kernel
knowing any weapon. Three generic hooks carry it:

- **Flight signals.** `FlightBehaviour.step` may return `impact` (go off here), `pulse` (run the
  weapon's `pulse` impacts here and keep flying; runs before collision, so a digger's tunnel op
  clears its own way), `skip` (a teleport: no collision this tick, used by `flight.lightning`) or
  `die`. An optional `contact(api, p, params, hit)` decides what a hit means: `impact` (default),
  `pulse` (a laser cutting on), `continue` (a roller that has landed and now follows the ground)
  or `die`. `hit` carries the hit cell, the last free cell before it and the tank hit. Flights
  never draw from the match RNG, because `predict` (the AI's solver) runs them too.
- **Child shells.** An impact may `spawn` children: one weapon or a random pool, `count`, velocity
  `inherit`ed from the parent, fanned by `spread`, `jitter` (match PRNG), `up`, or a `bounce`. MIRV,
  Scatter Bomb, Skipper hops, Mystery Shell, Acid Rain and the Water Cannon stream are data only.
  Children are sub-munition weapons with price 0, so they never reach the shop. At most
  `MAX_PROJECTILES` shells fly at once.
- **Zones** (§4a). An impact may leave a `zone`: at the end of each turn (with contact damage) it
  hurts tanks inside it and re-runs its `terrainOp` over itself for `turns` turns (Plague, Acid
  Rain), or, with `amplify` > 1, scales the next explosion centred in it once (Resonator). Zones
  are plain integers in `World.zones`, hashed, cleared each round, and appear in the snapshot as
  `ZoneView` entities. At most `MAX_ZONES`.

Ops that move things through the air get two more generic handles on `SimApi`: `debris` (an op may
steer particles in flight, as `terrainop.tornado` whirls the dirt it sucks up) and `hold(player, x,
y, fallFrom?)` (carry a tank this tick; once let go it falls, with fall damage from the highest row it
was carried to, or from `fallFrom` when given, as `terrainop.bumper` caps how hard its throws land).

New terrain ops: `terrainop.tectonic` (a crest that heaves the top of the ground forward as debris,
column by column, both ways) and `terrainop.quake` (a tremor that throws loose surface cells and
drops overhangs). AI personalities: all five of §3.7 (`moron`, `shooter`, `poolshark`, `tosser`,
`cyborg`).

### 3.3 Determinism (§6.3)

- Seeded PRNG (mulberry32 or xoshiro128**) owned by match state; the only randomness source.
- **Decided in milestone 1: fixed-point everywhere.** Positions/velocities are integers scaled by
  `FP = 65536`, held in JS numbers with products kept < 2^53. Only `+ - * /`, `Math.trunc/floor/round`
  and `Math.sqrt` are used: IEEE 754 makes these correctly rounded and therefore identical in every
  engine. Trig comes from a 0.1° table built at load with a Taylor series in basic arithmetic. The
  golden hashes are identical under Node, Vite's runner and the Vite-bundled sim in headless
  Chromium (V8), Firefox (SpiderMonkey) and WebKitGTK (JavaScriptCore): `pnpm determinism:browsers`,
  part of `pnpm verify`. Playwright's Firefox/WebKit CDN is blocked in cloud sessions, so
  `pnpm setup:browsers` installs Ubuntu's Firefox 136 .deb and WebKitGTK's MiniBrowser (under
  Xvfb) instead; Playwright's own builds are used wherever they are installed. Safari on
  iOS/macOS is a different WebKit port and build, so a real-device check is still `needs-device`.
- Deterministic iteration only (arrays, explicit ordering; no `Map`/`Set`/key-order dependence).
- No wall-clock time; time is the tick counter.
- Golden tests: recorded seed + input log ⇒ identical state hash on every run and machine.

### 3.4 Performance (§9)

Sim ≤ 2 ms average / ≤ 6 ms worst per tick on the reference phones; `pnpm verify` will enforce ≤ 2 ms worst on x86.
Typed arrays only, preallocated flood-fill queues, work bounded by dirty regions, large ops spread
across ticks. `pnpm bench` tracks baselines; >15% regression fails `pnpm verify`. Each tick's cost is
its fastest over 7 identical seeded runs (noise only adds time), and a failing case is re-measured once.

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
  readonly camera: CameraControl; // fit, integer zoom steps, eased glides, free pinch, pan + fling
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
`muzzle`, `land`, `creak`, `collapse`, `tankDeath`, plus the §5.1 ones); unknown types are ignored. Cosmetic particles are typed-array pools
stepped once per sim tick and seeded from the event (`FxRng`), never `Math.random`. Quality scales
particle caps (800 / 2,500 / 6,000) and turns the distortion pass and vignette off on `low`.

### 5.1 Effects library and themes (milestone 6)

- **Themes** are `theme.*` content items (`core/themes/<id>/manifest.json`): sky gradient,
  letterbox, rim light, trail colour, grain, vignette, ambient weather (`rain`, `snow`, `embers`,
  `stars`, `dust`), `wet` and `snow` surface treatment, `scanlines` and storm `flicker`. The sim
  never reads them, so each player picks one in Settings (stored per device). `game/palette.ts`
  turns manifests into `PixelTheme`s that travel with the `RenderPalette`; captures take the
  scenario's `theme` or `--theme`.
- **Material looks** (`look` on a material manifest, cosmetic): `cycle` colours stepped every
  `cycleTicks` in diagonal hard bands (lava, fire, napalm, burning oil, water) and `hot` (air above
  shimmers). They go to the GPU as a 256×9 look texture; the background pass reads the terrain
  and coating textures to cycle animated cells and to shift air cells over hot ones by whole
  cells (heat haze, off on `low`).
- Wet and snow are part of the cached terrain shading (re-shaded inside dirty rects, which grow 6
  rows down for that). Stars are a stateless sky-shader hash. Rain, snow, embers and dust in
  `ambient.ts` are stateless too: each particle's position is a function of its index and the
  render time, so nothing is stored and captures replay exactly. Zones (`ZoneView`) are drawn the
  same way: gas puffs, acid haze with drips, resonance rings of single cells.
- **GPU particles and smoke** (`render/pixel/gpu-particles.ts`, `render/pixel/fluid.ts`, both
  renderer-only): cosmetic particles live in WebGL2 transform-feedback buffers, one update pass per
  sim tick with the terrain texture as a collider. Smoke, heat and gas are an Eulerian fluid on a
  grid over the map (`GpuFluid`, one fluid cell per 1/2/4 map cells by quality) solved in fragment
  passes: splat, curl and vorticity confinement with buoyancy and wind, divergence, Jacobi
  pressure, gradient subtract, semi-Lagrangian advection. Solid map cells are walls (velocity and
  dye are zero in them). Effects pour into it through `FluidSink.splat` (blasts push outward and
  leave hot soot, burning ground breathes heat, gas zones spread dye); the field draws as hard
  grey, orange and green bands with a checker seam on the map grid. Both are stepped at draw
  time in tick order, so captures replay exactly. The solver follows the pass structure of Pavel
  Dobryakov's "WebGL Fluid Simulation" (MIT); the shaders are ours. The fluid needs
  `EXT_color_buffer_float` and is simply off without it.
- **Liquid surfaces** (`render/pixel/liquid.ts`, renderer-only): every pool of water, lava or tar
  on the map carries a one-dimensional wave field along its surface (one height and velocity per
  column, a Jacobi wave step per sim tick, level-preserving kicks so a pool never rises). Splashes
  (`WaterFx`), blasts and the wind feed it; waves run, meet and bounce off the banks. The surface
  also has a sheen: glints sliding along water, lava's crust glowing and bubbling into embers, tar
  blowing bubbles that plop. Crests, troughs, glints and bubble domes draw as whole map cells.
- More events: `bolt` (jagged Bresenham channel with branches, double-strike flicker), `quake`,
  `resonate`, `zone`, `zoneHurt`, `burn`, `implode`. `flash` carries the damage type (`dt`, added
  by the kernel's `explode`), which picks the glow colour and a coloured sky tint (sky reaction).
  Flashes with radius ≥ 60 add a white bloom blob and a chromatic split in the post pass (whole
  cells, decaying).

Camera: the fit view uses an integer scale on standard-density screens and a fractional fit on
DPR ≥ 2 (a one-device-pixel difference between cells is invisible there; rounding down would waste
half a phone screen). Zoom steps are integers; a pinch follows the fingers at any scale and then eases to an integer one when DPR < 2. The origin snaps to whole device pixels.

Client (`packages/client/src`): `game/match.ts` (`LocalMatch`: 60 Hz accumulator, max 8 ticks per
frame, snapshot stream, HUD state), `game/aim.ts` (slingshot maths), `ui/MatchView.tsx` (canvas,
pointer/keyboard input, aim preview), `ui/Hud.tsx` (wind, players, drag-to-change aim pills in `ui/Scrub.tsx`, weapon strip, FIRE),
`ui/Sandbox.tsx` (§2c.5). The match and sandbox are code-split from the title screen.

## 6. Audio (milestone 6; requirement §8b)

Chiptune only, and client only: the sim never reads audio, so a muted or audio-less peer stays
deterministic.

- **Content.** `audio.*` items (`core/audio/<name>/`) are either a synth patch (`synth.voices`: up
  to 8 voices of square, 25 %/12.5 % pulse, triangle, saw or LFSR noise, each with a stepped pitch
  sweep, envelope, arpeggio and vibrato; `radiusRef` makes bigger blasts lower and longer) or a
  tracker module next to the manifest (`module.file`). Every item records its licence (SPDX id,
  author, how it was made). `on` lists the effect events that play a sound, optionally per damage
  type; the damage-type match wins over the generic one (`flash` + heat → `audio.boom-heat`).
  Weapons can override their shot sound with `audio.fire`; the sim's `muzzle` event carries the
  weapon index for that.
- **Music** is two original 4-channel ProTracker modules (battle, title), composed as note data in
  `packages/content/scripts/make-music.ts` with chip waveforms and noise drums the script
  synthesises (`pnpm --filter @mudders/content music` rebuilds them byte-identically). They play
  through `chiptune3` (libopenmpt in an AudioWorklet, MIT). A Vite plugin serves its two worklet
  files under `audio/`, so they are fetched only on the first music play (they are in the PWA
  precache for offline play, but not in the initial JS).
- **Client** (`packages/client/src/audio`): `bridge.ts` is the only always-loaded part (a few
  functions the UI calls). The first pointer or key gesture loads `engine.ts`, creates the
  AudioContext (unlocked by that gesture, as mobile requires) and sets
  `navigator.audioSession.type = 'ambient'` where it exists, so iOS follows the silent switch.
  Buses: sfx, ui and music, then a master gain and a light limiter. The context is suspended while
  the tab is hidden. `synth.ts` sets pitch and volume in 60 Hz steps like a sound chip. At most 12
  SFX sound at once, and each sound has a minimum gap, so chain reactions stay readable.
- **Review and checks.** `pnpm audio:preview` (part of `pnpm verify`) renders every item in
  headless Chromium through the same code (OfflineAudioContext, the real worklet), fails on
  silence, and writes `captures/audio/*.mp3` plus an SFX reel with a timestamped index.

## 7. Networking (milestones 4 and 5)

Code: `packages/shared/src/protocol.ts` (every message, Zod), `packages/signal/src/lobby.ts` (rooms,
relay), `packages/client/src/net/` (`link`, `lockstep`, `session`, `signal`, `rtc`) and
`packages/client/src/ui/Online.tsx`.

- **Topology**: star around the host (§6.2). Every connection is a `Link` (`net/link.ts`): JSON
  peer messages, validated on receipt, large ones split into ≤ 15 kB parts. A link runs over an
  `RTCDataChannel` (`p2p`), the signalling server's WebSocket relay (`relay`) or memory (tests).
- **Connection ladder** (`net/rtc.ts`): the guest asks the host (via the relay channel) to dial; the
  host sends an offer with trickle ICE over public STUN (`VITE_ICE_SERVERS` overrides). If the data
  channel isn't open in 5 s the host switches both sides to the relay. Relay frames carry a link
  epoch so a replaced link's late frames never reach its successor. The host reports each link's
  path and time-to-open to the server (`GET /stats`), so the TURN decision is data-driven.
- **Lockstep** (`net/lockstep.ts`): every input goes to the host, which stamps it with the tick it
  applies it before (`HostMatch.stepOnce`), appends it to the match log, and sends guests
  `tick { upTo, inputs }` (immediately when there are inputs, else every 3 ticks). A guest only
  simulates ticks before `upTo`, so it never predicts or rolls back; it trails the host by about
  half a round trip and catches up faster than real time when behind. Guests throttle aim inputs
  to one per 50 ms; the host collapses consecutive aims per tick.
- **Desync**: every 120 ticks each guest sends `world.hash()`; the host compares with its own. On a
  mismatch (or a guest that sees an input stamped in its past) the host sends `start` with the seed,
  setup and whole input log, and the guest rebuilds by re-simulating (≈ 0.02–0.05 ms per tick, so a
  10-minute match replays in about a second). This is the §6.3 resync; a serialised world snapshot
  would be faster for very long matches and can replace it behind the same message.
- **Join check**: the guest's `join` carries protocol version, kernel version and content hash; the
  host refuses any mismatch with a "reload to update" reason (§2c.4). The signalling server refuses
  a different protocol version at `hello`.
- **Resilience** (§6.1): the signalling identity (id + secret) and the seat token live in
  `sessionStorage`, so a dropped socket, a reload or a cell handover reclaims the same server
  identity and seat. Both sides ping every second; 6 s of silence closes a link. A guest whose link
  died asks the host to re-dial and sends `haveTick`; the host re-sends the log from that tick (or
  everything after a reload). The server keeps a dropped member seated for 30 s and closes a room
  when its host is gone that long or it idles for 2 h.
- **Lobby** (`signal/src/lobby.ts`): `hello`, `createRoom`, `roomSettings`, `joinRoom(code)`,
  `leaveRoom`, `listRooms`, `startMatch`, `offer`/`answer`/`ice`, `relay`, `path`; replies `welcome`,
  `roomUpdate`, `rooms`, `error`. 6-character codes without look-alike characters, room creation
  rate-limited per address, a per-connection message cap. Seats, rules and names are host state sent
  over the links (`lobby`), so the copy-paste mode needs no server at all.
- **Server-less mode**: `directOffer`/`directAnswer` wait for ICE gathering and encode the session
  description as `MUD1.` + base64url(deflate-raw). One invite per guest. No relay or reconnect in this
  mode (there is no server to fall back on).
- **Not yet**: host migration (if the host leaves, the match ends) and TURN (see §7.1).

### 7.1 Public games and resilience (milestone 5)

- **Public rooms** (§6.1, §6.5): `createRoom` carries a rough `region` (from the host's time zone,
  so no geolocation lookup) and the host keeps the listing current with `roomSettings` (public or
  private, name, one-line rules summary, and `maxPlayers` = seats not taken by bots). `listRooms`
  returns rooms that are public, not started, not full and whose host is online, oldest first, at
  most 50. The client's **Browse public games** screen (`#browse`) polls it every 4 s; a row is a
  `#join/<code>` link, so joining is the same path as a share link.
- **AI takeover** (§6.1): `{ type: 'takeover', bot: 'ai.*' | null }` is a sim input. The world
  binds the personality and, if it's that tank's turn, restarts the turn for the new controller (a
  bot's think time, or the human's turn timer); in the shop a bot shops and readies at once. Only
  the host issues it (`HostMatch.handle` drops one sent by a guest): `HostSession.heartbeat` seats
  `ai.shooter` for a human whose link has been gone for `takeoverMs` (host setting: 10, 20 (default)
  or 60 s, or never), and a rejoin hands the tank back. Because it is stamped and logged like any
  input, every peer and every rebuild from the log agrees on when it happened. The lobby seat shows
  `standIn` and the host's banner says "X is away · AI playing".
- **Hidden host tab**: a hidden page gets no animation frames and its timers are throttled to once
  a second (once a minute after five minutes), which used to freeze the match for everyone. The host
  now drives its heartbeat, and while hidden its match, from a dedicated worker's timer
  (`net/ticker.ts`), which browsers don't throttle that way. A host hidden longer than the takeover
  window gets a stand-in for its own turns until it is back. A phone that suspends the whole page
  still stops the host; guests then see a dropped host (`needs-device`). Guests use the same ticker
  for their pings, so a briefly hidden guest keeps its link.
- **PWA**: `public/manifest.webmanifest` (landscape, fullscreen, pixel-art icons rendered by
  `packages/capture/make-icons.mjs`), and a service worker generated at build time by the `pwa`
  plugin in `vite.config.ts` from `pwa/sw-template.js`: it precaches every build file under a cache
  named by a hash of the file list, serves the page network-first (cached shell offline) and hashed
  assets cache-first, and never touches other origins (lobby server, STUN). After one visit, local
  play works offline. The title screen shows **Install app** when the browser offers the prompt
  (Chromium), and an "Add to Home Screen" hint on iOS Safari. `pnpm play:smoke` checks the manifest
  and an offline reload into a local match. `?sw=0` skips registration.

### 7.2 TURN decision (§6.4)

**Decision: no TURN server for now.** The WebSocket relay is the guaranteed path; TURN would only
move relay load off the signalling server, and relay load is tiny: a 4-player match sends about 20
small frames a second per guest (≈ 1–3 kB/s per guest), so even dozens of concurrent relayed
matches fit the free tier's bandwidth. A turn-based game also doesn't need TURN's lower latency.

The server measures what the decision needs, at `GET /stats`:

- `paths.p2p`, `paths.relay`, `paths.relayShare`: how links ended up connected (the host reports
  each link), and `paths.meanMs` time to open.
- `relay.bytes`, `relay.bytesLastMinute`, `relay.peakBytesPerMinute`, `relay.frames`: relay load.

Revisit when either holds over a week of real play: `peakBytesPerMinute` above ~50 MB (≈ 7 Mbit/s,
the point where a free instance's bandwidth or CPU starts to matter), or `relayShare` above ~60%
with players reporting lag. Then add a TURN server through `VITE_ICE_SERVERS` (JSON
`RTCIceServer[]`, credentials included): a hosted free tier (e.g. a metered TURN service's free
quota) first, `coturn` on a UDP-capable free host second. No code change is needed beyond that
variable. The counters are in memory and reset when the free instance restarts, so read them often
(stats in a database are an optional §7 item, not built).

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
  `VITE_SIGNAL_URL`. Without it the client uses `<page origin>/signal`, which the Vite dev and
  preview servers proxy (WebSocket included) to the local signal server on :8787, so same-network
  play needs only the page's address. In dev the invite link swaps `localhost` for the machine's
  LAN address. The page is not a secure context on `http://192.168.x.x`, so client code must not
  rely on secure-context-only APIs (`crypto.randomUUID`, service worker, clipboard) for anything
  essential. `pnpm play:net`'s `lan` run covers this path.
- **Signalling**: Node on Render free tier (`pnpm --filter @mudders/signal start`, `PORT` env). The
  client must handle cold starts ("waking up the lobby server…").
- **No GitHub Actions**, to save build minutes. `pnpm verify` (lint, format check, typecheck, test,
  build, smoke) runs locally in the dev session before every push; failures are fixed there. Where the
  requirements say "CI", read "`pnpm verify`".
- **Browser target**: root `browserslist` is `baseline 2026`; Vite's esbuild target is derived from it.
