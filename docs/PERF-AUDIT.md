# Performance audit (2026-11-16)

A sweep from the kernel to the client for speed on a phone, with no change in look or behaviour
and the same sim results (online play needs every peer to compute the same thing). This file says
what was measured, what was fixed, and what is left with a size estimate, so the next pass does
not start from zero.

All times are from an x86 cloud machine. A mid-range Android phone is roughly 3 to 5 times slower
per core; multiply before comparing with the §9 budgets (sim ≤ 2 ms a tick, renderer ≤ 6 ms a
frame).

## How to measure

- **Sim**: `pnpm bench`. The baseline was taken on a faster machine, so on a slow cloud machine
  every case reports "slower"; compare two builds on the same machine instead (build the bench
  with `vite build --ssr`, run both builds alternately, keep the best of several runs).
- **Sim, which function**: `node --cpu-prof` on that bundled bench. Count only what is under
  `World.step`: every bench case also builds a world, and map generation would dominate the
  profile otherwise.
- **Client JavaScript**: a bot match in headless Chromium with the CDP profiler. SwiftShader
  stalls the GPU process for seconds at a time and the page then runs at about 1 fps, so the
  profile is useless as it is. Stub the draw calls (`drawArrays`, `drawArraysInstanced`,
  `texSubImage2D`, `bufferSubData`, `clear` on `WebGL2RenderingContext.prototype`) from an init
  script and the page runs at 60 fps with the JavaScript cost intact. Seed `Math.random` so two
  runs do the same work.
- **GPU**: cannot be measured in the cloud. SwiftShader's cost per draw has little to do with a
  phone GPU's, and its stalls land on whichever call happens to wait. The numbers have to come
  from a device: Settings → Show performance gives fps, sim and render CPU time. Low fps with low
  sim and render times means the GPU is the limit.

## Where the time goes

A 4-bot match on Lakeland (medium map, phone-sized viewport), 60 s, draws stubbed: the main
thread is busy 23% of the time, **3.8 ms a frame**. Of that:

- renderer JavaScript: 33%
- sim and content (and React, in the same chunk): 26%
- WebGL calls (about 560 a frame): 17%
- browser internals (style, layout, compositor): 16%
- the match view's frame callback and HUD state: 6%

The sim alone is cheap on dry land (0.02 ms a tick on average over a round); water that never
rests (Lakeland's tides) keeps the settle step busy every tick. What a player feels on a phone is
the single long tick or frame, not the average.

## Fixed in this pass

Sim (same results, golden hashes unchanged):

- `settleStep` starts each row at its first non-air cell and skips sky four cells at a time; ground
  at rest leaves the loop after one check. Flood case 35% faster, a full round 25%.
- `supportPass` looks for a cell with air under it before working anything out (soft ground
  returns at once), climbs columns in memory order, skips sky rows and keeps its later scans to
  the hanging cells' box. The worst tick after a collapse went from 2.8 ms to 1.5 ms.
- `DebrisPool.step` traces with integer shifts instead of float division.
- `World.trace` (every shell step, and every trial shot of a bot) only looks for tanks and lures
  cell by cell when the step's box touches one. Bot thinking is about 20% faster.
- `Hasher.bytes` mixes on locals and reads whole words where it can: the state hash that online
  play takes every 2 s is about a third faster, with the same value.

Renderer and client (same picture, captures identical byte for byte):

- The tree sway field was rebuilt for the whole map (a column walk over every cell) three times a
  second while anything moved, about 6 ms each time. It now rebuilds only the columns the terrain
  changed in, and uploads only that box.
- The liquid surface rescan starts at the top changed row of each column instead of the sky.
- The smoke field set its constant uniforms before each of its ~20 passes a tick; they are set
  once now (about 50 fewer WebGL calls a frame).
- Manifests are parsed with zod's interpreter instead of compiling a parser per schema: loading
  the content at startup takes about a third less time.

## Second pass (2026-11-17): rain, snow, floods and the turn end

Measured with 4-bot rounds on 8 maps with 10 weathers and twists (map events on), and the client
census below.

- **GPU particles** (#208): one ring of slots kept every particle that died since the oldest
  living one was born inside the update and draw passes. In snow that was 68 000 slots for 8 000
  living particles, in clear weather and rain about 19 000 for 7 000. Slots are now in four lanes
  by lifetime (`particle-lanes.ts`). Vertex work per frame for particle drawing: clear 205k to
  100k, rain 208k to 118k, snow 768k to 125k.
- **Water in the sim** (#209, same results): a round with water in it cost 4 to 25 times a dry one
  per tick (dry 0.12 ms, rain 0.47, Cloudburst 1.2, Rising water 2.0, Flood wave 2.5 on average,
  5.7 on Floating islands). `reactStep` and `settleStep` now skip air, plain ground and the
  inside of a liquid body four cells at a time, and `surfaceFlowStep` finds the sky over its
  columns a row at a time. After: rain 0.29, Cloudburst 0.68, Rising water 0.82, Flood wave 1.23
  (worst map 2.2).
- **Turn end** (#210, kernel 0.61.0): debris, falling rock and toppling props had no limit and
  reset the grace, so a turn could wait 13 s. Now at most 4 s after the shot's own action is over.

How the GPU work was counted without a GPU: an init script wraps the draw calls and records, per
shader program, calls, vertices times instances and viewport or scissor area per frame, with the
draws themselves stubbed. It says nothing about milliseconds, but it shows work that is plainly
wasted (dead particles) and what scales with the screen (the full-screen passes).

What a plain rainy round adds over a clear one, after these fixes: about 3 400 rain particles,
0.2 ms of sim a tick on x86, and nothing else. JavaScript time per frame is the same.

## Left, by size

1. **GPU cost on the phone is unknown.** Per frame the phone draws the full-screen background
   pass (a 23 000 character fragment shader), 20 smoke-field passes at half map resolution per
   tick, the particle passes and about 40 batched draws. Which of these limits the frame rate
   needs numbers from a device. A GPU time line in the performance overlay
   (`EXT_disjoint_timer_query_webgl2`, where the browser has it) would answer it per pass.
2. **Online state hash**, 4 to 6 ms on x86 every 2 s (so a dropped frame or two on a phone, in
   every online match). The mix is one serial chain over 5.8 MB; hashing in four independent
   lanes would be 3 to 4 times faster, but it changes every hash value, so it needs new golden
   hashes and a kernel bump.
3. **First bot turn and first of anything**: a bot's first plan costs 40 ms on x86 before the JIT
   has warmed up (4 ms after), and the round's map generation 45 to 60 ms in the shop tick.
   Spreading a bot's planning over its thinking ticks would remove the first; it changes when the
   bot reads the world, so bot choices could differ (kernel bump).
4. **Look scan** (`scanLooks`): two whole-map passes for the look flags every 20 ticks while the
   terrain changes, about 1 ms. Needs a per-material count kept up to date from the dirty rects.
5. **Sudden-death wall motes** (`drawDeathWall`): up to ~3000 hashed motes a frame when both
   walls are on screen, 0.15 ms. Could be laid out once per zone step and only animated per frame.
6. **Startup bundle**: one 1 MB chunk (300 kB gzipped) holds React, zod, the kernel and all
   content, and the title screen loads it. Zod's schemas are built at import (about 100 ms on
   x86). Validating content at build time and shipping resolved manifests would remove both the
   parse and most of zod from the client.
7. **Per-frame HUD state**: `SimMatch.hud()` builds the whole HUD object and a key string every
   frame to see whether anything changed (0.1 ms). A version counter bumped by the sim events that
   matter would do.
8. **Flood rounds are still the heaviest sim** (1.2 ms a tick on x86 on average, 2.2 on the
   worst map, so 4 to 10 ms on a phone). What is left is spread thin: the settle scan reads every
   row of its region from the sky down (a third of it is finding nothing in sky rows), and the
   open-water step. A top-of-everything row kept by the grid would cut the sky rows; it needs
   every write to keep it up to date.
9. **Particle draw runs twice over every slot** (a normal and an additive pass, each discarding the
   other's particles in the vertex shader, 6 vertices a particle). Lanes by blend mode as well as
   lifetime would halve it again.
10. **Smoke field pressure passes**: about 21 full passes over the half-resolution field every
    frame, the most pixels of any pass after the background. Whether fewer iterations at low
    quality still looks right needs a look on a device.
11. **Tests**: 494 test files each start their own worker; vitest estimates 20 s saved with
    `isolate: false`. Worth trying on its own, since it can expose tests that lean on a fresh module
    state.

## First log from a phone (2026-11-17)

Joel's Android phone (Adreno 740, Chrome, 120 Hz screen), recorded with Settings → Show
performance → Record: Village in rain, 1600x800, 4 players (3 bots), high quality, 44 s.

- 98.5% of frames on time, 60 fps in every second (the screen itself moves between 60 and 120 Hz).
  Sim 1.6 ms a tick on average, the renderer's per-tick work 1.2 ms, drawing 1 ms of CPU a frame.
  Auto quality never stepped down. On this phone the GPU is not the limit in rain.
- Chrome on Android does not offer `EXT_disjoint_timer_query_webgl2`, so there are no GPU times.
- One 150 ms frame at the first shot of the match, with 4 ms of it in our code: the GPU driver
  builds a shader on its first draw, and the first muzzle smoke woke the smoke field (seven
  shaders) on that frame. Fixed: `PixelRenderer.warmUp` draws once with those shaders and the post
  pass before the first frame, and wipes the result.
- One 35 ms tick at the start of the first bot's turn: the cold first plan (item 3 above), in the
  aim phase where nothing moves. Later plans cost about 7 ms.
- Rain marks most of the map for settling at each turn start (600 000 cells in the region), which
  costs 2 to 4 ms a tick for a few seconds. In budget on this phone; item 8 is the lever.
- A single dropped frame in 6 of the 44 seconds with no cost in sim, step or draw time: not
  explained by the log (garbage collection or the browser's own work).

## Checked and not worth it

- **Shading several dirty boxes instead of one** in the terrain pass: measured over whole rounds on
  four maps, the union box is only 0 to 7% bigger than the boxes themselves. The shader's reach
  (16 cells sideways, 64 down) is what makes the shaded area 3 to 4 times the changed area.
- **Tank stain scan, pressure fronts, crush pass**: each shows up in a profile but costs under
  2 µs a tick.

## Ion Cannon in rain, from a phone log (2026-11-17)

A recorder v2 log from the Adreno 740 phone (Village, rain, Low gravity, high quality): the Ion
Cannon's blast gave frames of 75 to 125 ms for half a second, and the next turn started with two
frames of 65 to 70 ms. Reproduced here with the same setup; sim results are unchanged by the fixes
(golden hashes equal).

- **The freeze was a catch-up spiral.** For about ten ticks the blast costs 17 to 40 ms a tick
  (up to 60 000 cells settling and 18 000 debris pieces at once). A frame that ran late owed more
  ticks, ran them all, and was later still: 4 to 7 ticks in one frame. A frame now has a time
  budget for the sim (`SIM_BUDGET_MS`, 10 ms): once it is spent and ticks are still owed, a local
  match or host drops them and draws, a guest leaves them for the next frame. A heavy moment
  plays a little slow at 30 to 45 fps instead of stopping at 8 to 13 fps. Off in tests and
  headless runs (`SimMatch.limitFrame`).
- **Rain's turn start** cost 20 to 30 ms in one tick: it counted the water over the whole map in
  a plain loop that runs once a turn, so never optimised, and looked 60 columns each way from
  every column for the rims. The count now uses `indexOf` and stops at the cap, the rims come from
  one pass each way. Under 5 ms.
- **The shockwave ring** scanned the whole bounding box of the wave for a band a few cells wide;
  it now walks only the part of each row the band can cross (41 ms to 15 ms over a strike).
- **Still there:** one tick of 40 to 50 ms when the beam lands (a radius 200 crater in one go) and
  one of 30 to 45 ms for the collapse check after a blast that wide (`supportPass` over most of
  the map). Each is now a single long frame, not a run of them.
- **The uneven seconds after the blast** (frames of 33 to 50 ms with almost no CPU work) are on
  the GPU side, and Chrome on Android has no GPU timer. The recorder now measures there too:
  `GpuSampler` brackets one part of every sixth frame with `gl.finish()`, so the next log names
  the part.
