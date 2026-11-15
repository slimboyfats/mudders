# Audit against the GPU particle and fluid proposal

_Companion to [`POLISH-AUDIT.md`](POLISH-AUDIT.md). Joel asked (2026-11-08) for a particle and
fluid engine: "fluids, smoke, particles, shaders with millions of particles". This document checks
the game as it is on `main` (46e3779) against that proposal: what the proposal must respect, what it
replaces, what it unlocks, and where it would break something. Findings and recommendations only;
the build lives in its own thread._

## 0. The proposal, as briefed to the build thread

1. **GPU particles**: WebGL2 transform-feedback engine, state in ping-pong buffers, update shader
   samples the terrain texture for collision (bounce, slide, settle), wind and gravity as
   uniforms, kinds as a data table, rendering straight from the state buffer, pixel-snapped and
   hard-banded. Caps around 20k / 60k / 150k by quality (phones), more on desktop.
2. **Gas field**: an Eulerian solver on float textures (velocity, density, pressure; advection +
   Jacobi pressure) at map-cell or half-cell resolution; the terrain is the solid boundary,
   explosions are impulses, wind a global flow. Smoke, toxic gas, flames, dust and heat haze become
   density channels of one field, drawn quantised to the cell grid.
3. **Liquid layer**: cosmetic splashes, spray and sheen on top of the sim's own water, lava and mud
   cells, which stay authoritative.

## 1. Verdict

The proposal fits the architecture: the renderer already consumes a per-tick snapshot and effect
events only, the terrain is already an `R8UI` texture, cosmetic particles are already stepped per
sim tick (so captures replay exactly), and nothing in the sim or net code has to change. Four
things must be settled before it is "better" rather than "bigger":

- **The pixel rule is the design constraint, not a rendering detail.** A fluid field drawn as a
  smooth density map is exactly the soft-glow look Joel has refused twice. The field must be
  quantised to map cells with banded palettes and ordered dither at draw time, and particles must
  stay one cell. Build the quantised draw first and judge it on a capture before tuning the solver.
- **Capture time on SwiftShader is the budget that bites.** Every capture and the visual
  regression suite run on software GL. A full-resolution solver at 60 Hz would turn a 30 s capture
  into minutes (§3.2). The engine needs a capture/quality knob from day one and a measured spike
  before the design is fixed.
- **"Millions" is a desktop number.** The reference phones at 60 fps with terrain collision land
  around 200–500k one-cell particles; fill rate and the per-tick update, not storage, are the
  limit. Set the quality caps from a measurement on the S23+/iPhone 14 (`needs-device`), and
  keep the current 2.5k "medium" look as the "low" floor so a 3-year-old phone still plays.
- **Gameplay fluids stay in the sim.** Water, lava, magma, liquid dirt, mud, napalm, oil and tar
  are grid cells with deterministic settle and reaction rules that every peer must agree on. The
  GPU layer can make them look like liquid (sheen, spray, foam, embers), but it cannot move them.
  The gas field is the one place where "fluid" can be fully cosmetic, because gas clouds in the sim
  are already a handful of fixed-point puffs (`Zone.puffs`) and the renderer draws the cloud.

## 2. Constraints the proposal has to respect

| Constraint                                                                                                                    | Where it comes from                         | What it means for the engine                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pixel terrain, native everything else; effects light, distort and colour the grid but never smooth it                         | REQUIREMENTS §2a, CLAUDE.md "Visual review" | Field and particles are drawn snapped to cells, hard bands or dither; no bilinear sampling of the density at draw time.                                                                                                                                                                     |
| Effects obscure the map for a moment only                                                                                     | §2a "Avoid"                                 | Density decays within ~1–2 s of a shot; a cap on total opacity over terrain.                                                                                                                                                                                                                |
| Renderer-agnostic effect events; unknown events ignored                                                                       | §2b                                         | New events (`impulse`, `gasSource`, `emitField`) go through `@mudders/shared` effect-event types, with parameters, never shader names.                                                                                                                                                      |
| Cosmetic particles droppable without affecting determinism                                                                    | §5.2                                        | The engine never reads back; the sim never knows it exists. Already true.                                                                                                                                                                                                                   |
| Captures byte-identical for identical inputs                                                                                  | §2d                                         | Step the GPU sim per sim tick (as `Particles.step` does now), never per wall-clock frame; seed from the effect event (`rngFor`) as today.                                                                                                                                                   |
| Capture of a 5 s scenario ≤ 15 s; suite ≤ 5 min                                                                               | §2d, §9                                     | See §3.2: a quality knob for captures and a half-resolution field.                                                                                                                                                                                                                          |
| 60 fps on S23+/iPhone 14 at "medium" with a full-screen filter and "2,000 GPU particles"                                      | §9                                          | The 2,000 figure predates the engine; update §9 to the new caps and keep the frame split (renderer ≤ 6 ms).                                                                                                                                                                                 |
| WebGL2 is the floor; shaders run on SwiftShader                                                                               | §9, CLAUDE.md rule 8                        | Transform feedback is core WebGL2. Rendering **into** float textures needs `EXT_color_buffer_float` (or half-float), which is not core: check at mount and fall back to packing the field into `RGBA8` (two channels per texel) or to the current CPU particles. SwiftShader supports both. |
| Quality setting scales particle counts and disables the heaviest filters; mobile defaults to medium; low must still look good | §5.2                                        | Low = current CPU path (or 20k GPU particles, no field); medium = particles + half-res field; high = full.                                                                                                                                                                                  |
| Initial bundle ≤ 700 kB gzipped; shaders inlined                                                                              | §9                                          | The pixel chunk is 204 kB gzipped today; two more shader programs are a few kB. Fine.                                                                                                                                                                                                       |
| Battery: no rendering while hidden                                                                                            | §8a                                         | The GPU sim steps with the match clock, which already stops while hidden.                                                                                                                                                                                                                   |
| Slow-mo finisher and hit-stop scale the match clock                                                                           | ARCHITECTURE (PR #70, #71)                  | Particles and the field take `simDt` ticks, so they slow with the shot. Already how `Particles.step` is driven.                                                                                                                                                                             |

## 3. Risks, with numbers where there are any

### 3.1 The look

The current renderer went through three passes to get clouds, flames, smoke and lighting into hard
bands (`lighting.ts` "never a smooth glow", `PKind.Flame` colour bands, `PLUME_ALPHA` steps,
`BG_FS` haze "dithered on every other cell"). A density field is continuous by nature. The draw
pass must: sample the field at cell centres with nearest filtering; map density to 3–5 palette
bands per gas kind; dither between bands with the same ordered matrix the lighting uses; and
discard below a threshold so edges are crisp. Treat this as the first capture to approve, with a
Napalm and a Toxic Gas showcase, before any solver tuning.

### 3.2 Capture time on SwiftShader

Measured for this audit: `pnpm capture weapon-showcase weapon.napalm` at medium quality, 1600×800,
renders 956 ticks / 496 frames in **213 s** wall time in the cloud container (0.43 s per frame on
SwiftShader; sidecar `renderSeconds`). The spec's "5 s scenario in ≤ 15 s" is already exceeded by
an order of magnitude on the heavier showcases, so the engine cannot add much before captures stop
being a practical review loop. Rough cost of the field per tick, in texel-shades:

| Field resolution  | Passes per tick (advect ×3, divergence, 20 Jacobi, project, decay) | Texel-shades per tick | Per 5 s capture |
| ----------------- | ------------------------------------------------------------------ | --------------------- | --------------- |
| 1200×600 (1 cell) | ~26                                                                | 18.7 M                | 5.6 G           |
| 600×300 (2 cells) | ~26                                                                | 4.7 M                 | 1.4 G           |
| 400×200 (3 cells) | ~26                                                                | 2.1 M                 | 0.6 G           |

The existing full-screen passes (background with haze, terrain, post with ripples) at 1600×800 are
roughly 4 M texel-shades per frame, ~2 G per 496-frame capture, and that is most of the 213 s. A
full-resolution field stepped every tick would roughly triple the capture time; a half-resolution
field adds ~70 %. Recommendation: field at 2 cells per texel (smoke does not need
cell resolution; the draw quantises it to cells anyway), 12–16 Jacobi iterations, and
`--quality low` for `pnpm capture --diff` regression runs so the suite stays inside the 5-minute
budget. Measure the real number in the spike; the table is an estimate.

Particles are cheaper: 150k particles × 2 passes is 0.3 M vertex shades per tick, negligible next
to the field.

### 3.3 Memory on phones

Field at 600×300 in `RGBA16F`: 1.4 MB per texture × (velocity ×2, density ×2, pressure ×2,
divergence) ≈ 10 MB. Particles at 150k × 32 bytes × 2 buffers ≈ 10 MB. Fine on both reference
phones.

### 3.4 Float render targets on iOS

Safari supports `EXT_color_buffer_float` in WebGL2 since iOS 15, so it is inside Baseline 2026, but
it is an extension and the rule is "runtime check with a Baseline fallback". Mount-time check, and
the fallback is the current CPU particle path. Tag the iOS run `needs-device`.

### 3.5 Late joiners and reconnects

Effect events are fire-and-forget (§2a). A guest who resyncs mid-round from a host snapshot sees no
smoke or gas that was already in the air. Today that is the same for CPU particles and is
acceptable; the gas field makes it more visible (a Toxic Gas cloud is a sim zone, so its _damage_
is right but its _look_ is missing until the next `zone` event). Re-emit a `zone` event per living
zone on resync, which the sim can do from `World.zones` with no new state.

### 3.6 Determinism of the GPU sim across runs

Transform feedback and fragment math are deterministic on one GPU and driver for identical inputs
and identical dispatch order. Captures run on one SwiftShader build, so `--diff` keeps working.
Different players will see slightly different smoke, which is fine by design (cosmetic). Do not
make any test compare GPU-simulated pixels across browsers; `determinism:browsers` compares sim
hashes only and stays untouched.

### 3.7 Two particle systems during the migration

`effects.ts` has 84 emit sites across 9 kinds, and ten bespoke modules (`tornado.ts`, `storm.ts`,
`ion.ts`, `lance.ts`, `splash.ts`, `mushroom.ts`, `wreck.ts`, `chunks.ts`, `deathwall.ts`,
`ambient.ts`) keep their own particle-like state. If the new engine lands beside them, the game
has two smokes and two sparks for a while. Migrate by kind, not by weapon: port `Spark`, `Chunk`,
`Dust`, `Smoke`, `Plume`, `Flame` to GPU kinds with the same emit signature so every weapon moves
at once, then retire the CPU `Particles` class. The bespoke modules are addressed in §4.

## 4. Inventory: what the engine replaces, what it joins, what stays

### 4.1 Particle kinds (`particles.ts`, 9 kinds, CPU)

| Kind                          | Emit sites | Proposal                                                                                          | Gain                                                                    |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Spark                         | 25         | GPU particle, additive, collides and dies on terrain                                              | sparks skitter down slopes instead of sinking into the hill             |
| Chunk                         | 19         | GPU particle, bounces on terrain (restitution per kind), settles as a one-cell "grain" that fades | blasts throw real sheets of dirt; the nuke's 40-chunk burst becomes 20k |
| Dust                          | 18         | gas-field source (density channel "dust")                                                         | hugs the ground, drifts with wind, pools in craters                     |
| Smoke                         | 14         | gas-field source ("smoke")                                                                        | curls around hills, rises on heat                                       |
| Plume (smoke columns, PR #68) | 1          | gas-field source with a buoyancy term; keep the bending-in-wind look via the wind flow            | one solver instead of a hand-tuned lean curve                           |
| Flame                         | 3          | gas-field source ("heat" channel drives the colour bands) + sparks                                | napalm reads as a fire, not as rising blobs                             |
| Snow, Streak (weather, gusts) | 2          | GPU particles with terrain collision (snow lands and vanishes; streaks stay as is)                | snow visibly settles on ridges                                          |
| Glitter (fireworks)           | 2          | GPU particle, additive                                                                            | more stars per rocket                                                   |

### 4.2 Bespoke render modules

| Module                                | What it does today                                | With the engine                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smokeColumn` in effects (Plume)      | lingering wind-bent columns over big blasts       | gas field (§4.1)                                                                                                                                                                          |
| `mushroom.ts`                         | nuke mushroom cloud from puffs                    | keep the silhouette logic as a **sourcing shape** that injects density and an upward impulse; the field does the roll-over                                                                |
| `tornado.ts`                          | funnel of puffs that follows the sim's tornado op | a rotating velocity impulse in the field plus dust sources along the funnel; the sim still decides where the tornado is                                                                   |
| `storm.ts`                            | storm clouds, rain streaks, bolts                 | cloud deck as a slow density band in the field; rain as GPU particles (collision = splash spawn); bolts stay as polylines                                                                 |
| `ion.ts`, `lance.ts`                  | charge columns, beam, slag glow                   | stay; add an "ionised air" heat source into the field around the beam                                                                                                                     |
| `splash.ts` (water FX, PR #72)        | splashes and ripples on water cells               | GPU particles for the splash; ripples stay as a shader on the water cells                                                                                                                 |
| `chunks.ts` (debris, PR #64)          | bouncing ground blocks                            | keep: these are multi-cell sprites with their own bounce, few in number                                                                                                                   |
| `wreck.ts`                            | tank death sequence                               | keep; emit heat and smoke into the field from the burning hull                                                                                                                            |
| `deathwall.ts`                        | fallout wall particles at the map edges           | gas field source along the edge columns (a dense, dark, slowly swirling band); fixes the "wall at round start" note in the polish audit at the same time                                  |
| `ambient.ts`                          | stateless weather and lingering zones             | zones move to the field (§4.3); theme weather to GPU particles                                                                                                                            |
| `lighting.ts`                         | 8 point lights + heat chamfer field               | keep; feed the heat chamfer from the field's "heat" channel instead of a 20-tick CPU scan, and let embers (GPU particles) count as point lights by splatting into a low-res light texture |
| `BG_FS` heat haze                     | per-cell shimmer from the heat chamfer            | drive the haze from the field's heat channel (one source of truth)                                                                                                                        |
| `POST_FS` ripples (`MAX_RIPPLES = 8`) | cell-snapped refraction rings                     | keep; unrelated to particles                                                                                                                                                              |

### 4.3 Sim-side fluids and what each gets

| In the sim                                                                       | Deterministic rule                                            | Cosmetic layer with the engine                                                                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `material.water`, `flood`, water cannon                                          | flows, erodes, quenches; `splash.ts` draws it                 | spray particles on impact, foam cells where water moves, sheen stays a shader                                                                                |
| `material.lava`, `magma`, magma globs, volcano                                   | flows, cools to rock, contact damage, heat field              | ember particles rising and falling back, heat into the field (haze, smoke), glow bands as today                                                              |
| `liquid-dirt`, `mud`, quicksand, mud geyser                                      | settle-as-liquid, compacts                                    | droplet particles with collision; mud spatter grains that fade                                                                                               |
| `napalm`, `burning-oil`, `burning-tar`, `fire` cells                             | burn down dirt, spread, decay to ash                          | flame = heat source into the field above each burning cell; smoke rises from it; sparks                                                                      |
| Gas zones (`Zone.puffs`, Toxic Gas, Plague, Acid Rain, Thunderstorm, Superstorm) | fixed-point puffs drift with wind and sink; damage by overlap | field density sourced at each puff every tick, so the drawn cloud matches the sim's damage area but looks like gas; keep the puff positions as the authority |
| `gas-pocket` (crystal/gas)                                                       | bursts when opened                                            | one impulse + density burst                                                                                                                                  |
| Snow and rain weather                                                            | piles snow, soaks dirt (sim)                                  | particles that land where the sim says the surface is                                                                                                        |
| Oil and tar coatings                                                             | cohesion, ignite                                              | nothing new; sheen stays a shader                                                                                                                            |

Nothing above asks the sim for a new field. The sim's `Zone` already carries puff positions and the
burning materials are visible through the terrain texture, so the field's sources can be derived in
the renderer from the snapshot.

## 5. What the proposal does not cover yet

- **Content hook.** Explosions declare `effects: { burst: {count}, flash, shake, ripple }` (see
  `explosion.standard`). The engine needs a schema extension in `@mudders/shared` for field sources
  and particle kinds, e.g. `effects.field: { smoke: 1.0, heat: 0.4, impulse: 12 }` and
  `effects.particles: [{ kind: "chunk", count: 400 }]`, with defaults per explosion so that most of
  the 75 weapons change nothing. Kinds themselves should be a content type (`fx.*`) or a table in
  `packages/content` so the physics of a spark is data, as the proposal says.
- **Event list.** `impulse` (x, y, radius, strength, direction), `fieldSource` (kind, rate, ticks),
  and a resync re-emit of `zone` (§3.5). All renderer-agnostic.
- **Occlusion.** Smoke behind a hill must be hidden by the terrain cells in front; the field is
  drawn between terrain and entities, with the terrain mask as an alpha cut, and particles test the
  terrain texture at draw time (a cell inside solid is not drawn). The current CPU particles do not
  do this, and dirt chunks visibly pass through hills.
- **Quality and capture knobs.** `QUALITY_PARTICLES` becomes `{ particles, fieldScale, jacobi }`
  per level. `pnpm capture --quality` already exists (default medium), so the engine's caps hook
  into it, and the `--diff` regression runs should pin `low`.
- **A spike before the design freezes.** One day: transform-feedback particles with terrain
  collision for `Spark` and `Chunk`, a half-res field with one density channel sourced by the
  Missile burst, quantised draw, `pnpm capture weapon-showcase weapon.napalm` before/after with the
  `renderSeconds` numbers in the thread. Decide resolution, Jacobi count and caps from that.

## 6. Payoff ranking: where the engine shows most

1. **Napalm, Hot Napalm, Plasma Blast, Incendiary** (fire + smoke + heat): the field makes fire a
   fire. Currently three rising blob kinds and a haze.
2. **Toxic Gas, Plague, Acid Rain**: gas that pools in valleys and leaks over ridges with the wind,
   matching the sim's puff positions.
3. **Nuke family and Ion Cannon**: mushroom roll-over from the field, 100k dust and dirt
   particles, the sky flash lighting the dust.
4. **Smoke columns, tank wrecks, the death wall**: one smoke model instead of three.
5. **Dirt Tsunami, Earthquake, Tectonic Charge, Fault Line**: dust sheets along the wave and
   grains that settle where the dirt lands.
6. **Weather**: rain that splashes on the surface and snow that lands; the storm deck in the field.
7. **Volcano Seed, Magma Bomb, Meteor Shower**: embers that light the ground.
8. **Tornado**: a real vortex in the velocity field around the sim's funnel.

## 7. Order of work (PR-sized)

| PR              | Scope                                                                                                                                                        | Gate                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1. Spike        | TF particles (Spark, Chunk) with collision; half-res field with one channel; quantised draw; Napalm + Missile captures; `renderSeconds` before/after         | Joel approves the look; capture time ≤ 2× today               |
| 2. Particles    | Port all 9 kinds, terrain collision and occlusion, quality caps, retire CPU `Particles`; play:smoke unchanged                                                | `pnpm check`, captures for Missile, Nuke, Fireworks           |
| 3. Field        | Smoke, dust, heat channels; sources from burning cells and `Zone` puffs; haze and heat-field lighting read the field; smoke columns and death wall move over | Napalm, Toxic Gas, Heavy Nuke captures; capture suite ≤ 5 min |
| 4. Content hook | Shared schema for `effects.field` / `effects.particles`, `fx.*` kind table, defaults on `explosion.*`; docs regenerated                                      | content:validate, no sim change (hash unchanged)              |
| 5. Liquid layer | Splash and spray particles, embers, mud spatter; `splash.ts` reduced to ripples                                                                              | Flood, Magma Bomb, Mud Geyser captures                        |
| 6. Spec         | Update REQUIREMENTS §2a/§5.2/§9 (particle caps, field budget, capture quality) and ARCHITECTURE §5                                                           | docs only                                                     |

Real-device fps on the S23+ and iPhone 14, and the iOS float-texture path, are `needs-device` after
PR 2 and PR 3; the deploy preview URL plus a two-line checklist go in the thread.
