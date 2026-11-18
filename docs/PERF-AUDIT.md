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
- **Rain that stopped halfway down** during the slowdown: a late frame ran at most two particle
  passes however many ticks it owed, and the ticks it skipped aged the particles without moving
  them. Rain lives exactly as long as its fall takes, so at three or more ticks a frame it died
  in mid-air. The frame budget above keeps the tick count per frame down in a heavy moment, and
  particles now run up to four passes a frame (the smoke fluid stays at two, its steps are the
  costly ones).

## The HUD repainted on every frame (2026-11-17, second phone log and a screen recording)

After the sim fixes the phone still dropped frames: 25 to 40 fps through a bot's turn with under
3 ms of sim a tick and about 4 ms of our own GPU work a frame. A Chromium trace of the page (not
of the game) showed why: the browser painted the whole document and rasterised the HUD on almost
every frame.

- **The wind bar** animated `background-position` for ever (`wind-run`). That cannot run on the
  compositor, so every frame repainted the HUD layer, with its gradients, rims and glows. Since
  the fill became a plain gradient the stripes were not even visible. Removed: over 20 s of bot
  turns the document paints fell from 1185 to 158 and raster work from 2.6 s to 0.35 s.
- **Backdrop blur over the live map** (round, wind, temperature and timer badges, camera and menu
  buttons) has to be redone whenever what is behind it changes, which is every frame. Inside a
  match nothing blurs any more; the panels keep their tint, rims and glow.
- The performance box sat on the player chips in landscape; it is centred now.
- An infinite CSS animation in the HUD is only safe on `transform` or `opacity`. Check new ones
  with a trace: `Paint` events on `#document` should be rare while nothing in the HUD changes.
- The one-second freeze in that log (t=38.5 to 39.5) was most likely the phone being turned to
  landscape mid-recording (the log starts in portrait, a screenshot from 0:20 is landscape): the
  page lays out again and every canvas-sized buffer is rebuilt. Not confirmed.

## Rain pushed out of its lane by blast smoke (2026-11-17)

Seen on the phone: after a big blast the rain stopped falling and stood as a fringe along the top
of the map. The particle lanes (by lifetime) put rain on an 800-row map (life 260) in the same lane
as long-lived smoke motes. A big blast filled that lane, and a full lane overwrites its oldest
slot, so every drop was replaced a few ticks after it was born. Rain and snow now have a lane of
their own (`ParticleLanes.put(tick, life, weather)`). The weather also starts above the top of
the screen when sky shows over the map (portrait, zoomed out) instead of at the map's top row.

## The recorder's own GPU sampling stuttered the rain (2026-11-17, third phone log)

After #223 and #224 the phone held 60 fps on average, yet the rain still stuttered in Joel's
recording. The skipped frames in the recording came in a steady rhythm, one about every 0.33 s,
and the log showed long frames with 40 to 46 ms of script while the sim, the renderer step and
the draw together took under 10 ms. The overlay showed "sim worst 40 ms" every second.

The cause was the recorder. Chrome on Android has no GPU timer query, so #215 bracketed one part
of every sixth frame with `gl.finish()`. For the two parts that come first after the frame before
(the per-tick step and the first part of the draw), the first `finish` waits for that whole frame
to be presented, about 40 ms on the phone. Six parts in turn, two of them slow: one hitch every
18 frames.

`GpuSampler` now measures nothing by itself. Pressing "Slow now" starts a burst: every frame
measures one part, each part six times, under a second in all, and then the game is left alone
again. Those frames stutter from the measuring and the log says so. The numbers it gave before stand
(about 6 ms of GPU per frame, the particle step the largest part), so the GPU is not what limits
the phone. Rule: a measuring tool that blocks must be opt-in, and a log must be read with the
tool's own cost in mind.

A recording made right after, with the recorder off, still shows the phone held upright and
zoomed far out at about 40 fps (25 ms frames on the 120 Hz screen), and 13 to 20 fps while a
Drill Torpedo flew and dug. The page itself is not it (a Chromium trace in that shape has 194
paints in 25 s), and SwiftShader shows no part that grows with that view. Open: needs a log from
the phone in that view with "Slow now" pressed, which now gives the GPU time by part.

Joel asked for no button to press, so a recording now also starts a burst by itself when frames
turn slow (`SlowWatch`: a few frames over 24 ms close together, at most once in ten seconds). The
`note` column carries the zoom, so the log shows the view the slow seconds were played in.

## Uneven frames on a 120 Hz screen (2026-11-17, fourth phone log)

The first log made with the burst measuring, phone upright and zoomed out to 0.25: 47.7 fps, with
65% of frames at 17 ms or under and 23% at 25 ms. In the slow seconds the sim, the renderer and
the page together use about 3 ms of CPU a frame and the GPU about 3 to 5 ms. A Chromium trace of
the same view has 176 paints in 20 s. Nothing is slow, and still frames arrive late.

The screen runs at 120 Hz and the loop drew on every animation frame. A frame that needs 10 ms
misses every other refresh, and a little more misses two, so frames land 8, 17 or 25 ms apart in
no order while the sim ticks at a steady 60. Rain, which moves the same distance every tick, shows
that as stutter. More particles in view (33 000 when zoomed out, against 10 000) push more frames
over the edge, which is why it was worse upright and zoomed out.

Fix: a frame is never started sooner than `MIN_FRAME_MS` (10 ms) after the one before. At 120 Hz
that is every second refresh with a full 16.7 ms to finish in, at 60 and 90 Hz every refresh.

Not verified on the phone. Still open in that log: single ticks of 36 to 50 ms (a wide settle
after the Ion Cannon, the first plan of a bot, the Ion Cannon shell landing).

## Panning held the game up (2026-11-18, fifth phone log)

With even pacing the calm seconds of the log are a steady 60. Joel: "the rain hold up when I pan".
The frame loop put the active tank's screen position in React state (`setAnchor`), for the aim
guide. That position changes on every frame of a pan or pinch, so the whole match view rendered
again per frame and the full-screen SVG overlay was repainted with it. The cost sits outside the
frame callback, so the recorder's "other js" never showed it.

The aim guide is now its own small layer, moved with a transform straight from the frame loop.
Chromium trace of ten seconds of one-finger panning in portrait: paints of the page 194 to 26,
of the overlay 177 to 0, raster 362 ms to 234 ms.

Rule: nothing that changes with the camera goes through React state.

## Resting ground, four cells at a time (2026-11-18)

In rain every turn starts with 1 to 2 seconds at 42 to 55 fps on the phone. `weather.rain` wets
hollows all over the map and reports them as one box, so the settle region spans the whole map
for about 80 ticks while the new water finds its place. The scan already skipped air and resting
liquid by the word; ground at rest still went cell by cell, and it is nearly all of such a region.

`settleStep` now passes four cells of one kind of falling ground at once when the same ground lies
under all four, none of them falls, slides or is shaken loose, and no grain has been stamped in
this pass. Each of the four has its neighbour in the word beside it, so each would have left by
the ground-at-rest test anyway. Same results: golden hashes unchanged, no kernel bump.

Village 1600x800 in rain, the 180 ticks after each turn start, in node: settling 3.1 to 0.6 ms a
tick on average, single ticks 10 to 12 ms down to 1.5 to 5 ms. (An earlier try at this, in #215,
changed results and was dropped; it lacked the test for stamped grains or the row below.)

## The first big blast of a session ran on cold code (2026-11-18)

The phone logs kept showing single ticks of 25 to 50 ms: the Ion Cannon beam landing, the seven
ticks after it while the hillside comes down, a Nuke's crater settling. Profiling the same turn
twice in one process gave the cause. It is not the amount of work, it is the first time:

- Ion Cannon on Village 1600x800 in rain, production bundle in node: worst tick 43 ms the first
  time (settling 23 to 27 ms for seven ticks, the beam 38 ms), 8 to 10 ms from the second time on.
- Nuke, after three Ion Cannons and two Superstorms in the same process: settling 14 to 20 ms a
  tick the first time, 1 ms the second.

`--trace-deopt` shows why. `settleStep` is one large function; V8 optimizes it for the paths it
has seen (rain trickling, small craters) and throws that code away the moment a path it has not
seen runs (a mass landing hard, grains pressed sideways, spray). The rest of that tick, and the
next few while a new version compiles (20 to 50 ms on a desktop), run on unoptimized code, ten
times slower. Each new kind of blast repeats this once.

Fix: `game/sim-warmup.ts` fires an Ion Cannon, a Nuke and a Superstorm on a hidden 480x240
village in rain, one tick at a time in idle callbacks, starting 1.5 s after the page loads (about
1300 ticks, 0.7 s of CPU on a desktop). It stays out of the way while a match resolves a shot.
Nothing of it is drawn or kept; the sim keeps no state between worlds. After it, in node: first
Ion Cannon worst tick 43 to 17 ms (settling ticks 25 to under 4), first Nuke 14 to 8 ms, first
Kaiju 25 to 6 ms, first Napalm 11 to 4 ms. A 240 or 320 wide map was not enough (the Nuke's
slow ticks stayed), and one weapon alone only covers its own paths.

Measuring notes, for next time:

- Vitest and `vite-run` (so `pnpm bench` too) read every imported constant (`FP_SHIFT`,
  `SETTLE_FALL`) through a getter on the module object. In hot loops that getter is most of the
  time, so line profiles from there point at the wrong lines (the debris trace looked four
  times as expensive as it is). Profile a bundle instead: `vite build` with `build.ssr` and
  `ssr.noExternal`, then plain `node`.
- Run a turn twice in one process before believing a slow tick. If the second run is fast, it
  is cold code, and making the code cheaper will not help.

## Rock, props and mixed ground, four cells at a time (2026-11-18)

The scan in `settleStep` passed air, resting liquid and one kind of resting ground by the word;
rock, walls, props and ground of mixed kinds still went cell by cell, and in a village in a storm
that was most of the cells it looked at. Two more word tests, by a class table per material:

- four cells that never move (`SETTLE_STATIC`) are passed at once;
- so are four cells of anything but air and runny liquid, none of them moving, with something
  beside them at both ends and a floor under all four that nothing sinks through. With a
  neighbour on each side and a floor, a cell that is not moving takes none of the rules.

The test for "no grain stamped this pass" on the resting-ground word is gone: a stamped grain
that came to rest takes the same way out as its neighbours, and a stamp left behind is never
read again (pass numbers are not reused; the stamps are cleared when the counter starts over).

Same results: golden hashes unchanged, no kernel bump. Superstorm on Village 1600x800 in rain,
bundle in node, second run: settling 470 to 318 ms over the turn's 790 ticks.

Tried and dropped: tracing flying earth with one division per axis instead of one per step. No
measurable gain in the bundle (the divisions only looked expensive under Vitest, see above).

## Zoomed far out: the motes in the edge walls (2026-11-18)

Fifth phone log: render CPU 5 to 7 ms a frame at zoom 0.12 to 0.27, against 1 to 2 ms up close.
A CPU profile of the built client in headless Chromium, upright and zoomed all the way out, named
it at once: `drawDeathWall` 25% of all CPU time, with the batch `push` and upload behind it
another 6%. Zoomed out, the walls beside the map fill much of the screen, and the green motes
inside them sit on a lattice of 61 columns per side by one row per 26 cells of view height: tens
of thousands of motes, each worked out (four hashes, a sine) and pushed as a quad every frame.

A mote is a pure function of its lattice place and the render time, so `WallMotes` puts the
lattice in a static instance buffer (rebuilt only when the camera leaves the rows that are
ready, 12 spare rows each way, or the face moves a column) and the vertex shader works out where
each speck is now. Same specks in the same places: the capture sheet of a zoomed-out scene
differs from the old one in 113 of 3.9 million pixels, by one step of 255.

Same profile after: `drawDeathWall` 3091 to 968 ms of 12 s (what is left is the wisps on the
face), `push` 590 to 190 ms, idle 43% to 62%.

## Wind bar stripes, back as a layer (2026-11-18)

The stripes that ran along the wind bar were removed in #223 because animating the fill's
`background-position` repainted the whole HUD every frame. Joel asked for them back on their own
layer. They are now a strip inside the fill (`.wind-fill::after`, clipped by the fill) that only
slides with `transform`, so the compositor moves it. Chromium trace of 15 s of a match in rain:
Paint 0 to 3 ms a second, as without the stripes.

## The wall's wisps too (2026-11-18)

What was left of `drawDeathWall` zoomed far out (968 ms of 12 s) was the wisps torn off the
wall's face: 70 per 100 rows of view per side, each five hashes and a sine a frame. `WallWisps`
keeps what never changes about a wisp in a static buffer and a vertex shader places it, handing
the quad shader's stipple shape the same centre, size and density as before. The capture sheet
of the zoomed-out scene is pixel-identical. Same profile: `drawDeathWall` gone from the list
(only the lightning is left in it), idle 62% to 67%; from the start of this work 43% to 67%.

Checked and left alone: the sway of grass and trees. The swaying is done in the background
shader already; `swayField` only rebuilds the map of what can sway for the columns whose
terrain changed (1.4% of CPU in rain, where water changes every tick).

## Recorder v3: where a stall is, shader links, draw calls (2026-11-18)

Taken from the logging guide of Joel's other game. The log's header now carries `build` (the
commit). A browser stall names the file and character position of its longest script
(`at MatchView-xxxx.js:73407`), which the build's source map turns back into a function when the
name is a shortened one, and how much layout that script forced. A new `## events` section lists
every shader program linked while recording with its time (a link in the middle of play is a
freeze on a phone; none should appear after the warm-up), console errors and warnings, uncaught
errors, the window changing size and the tab being hidden. The summary has frame time p50, p95, p99 and max over all frames
and draw calls a frame, the rows have a `draws` column, and the log ends with `END` so a cut-off
paste shows. The counting wraps the context's draw and link calls only while a recording runs
(`watchGl` in `game/perf-log.ts`) and removes the wrappers on Stop.

## Rain: the look scan every 20 ticks was a 35 ms frame on the phone (2026-11-18, seventh log)

The first recorder v3 log (upright, zoom 0.24, Village, rain) had 42 browser stalls, all at the
frame callback, 0.33 s apart, with 35 to 45 ms of script each, while sim, render and other JS
added up to about 5 ms. Seconds with no terrain change ran a flat 60. The time was in the
renderer's step, which the log only shows as an average: `scanLooks`, every 20 ticks whenever
terrain changed. Rain changes cells in every column on every tick, so in rain the scan never
rested and always covered the whole width: two whole-map passes for the look flags, a walk up
every column for the sway field, and a whole-map compare for its texture.

On a 1600x800 Village map in rain (node, bundled): flags pass 3.1 ms each for terrain and
coating, sway field 6.4 ms, about 12.5 ms per scan on a desktop. Now:

- `scanCells` reads the layer four cells at a time and passes a word equal to the one before
  it in one compare (320 000 words, 4 300 differ from their neighbour): 0.9 ms for terrain
  including the sway columns, less for coating.
- The same pass notes, per column, the lowest row with a swaying cell and the rows they span.
  The sway field is rebuilt only in runs of columns that held a swaying cell or hold one now,
  each column starts at its lowest swaying cell instead of the bottom of the map, and only the
  rows that can hold swaying cells are cleared, marked and compared for upload: 1.1 ms.

About 2.3 ms per scan instead of 12.5, with the same field (tests compare it with a whole
rebuild over 300 random edits; the benchmark compares it on the real map). Not measured on a
phone. Left: the heat field is still a whole-map rebuild every 20 ticks while lava or fire is
on a map that keeps changing.

The recorder hid this: it showed the renderer's step only as an average, and its list of long
frames gave the costs of the late frame, not of the frame before it whose work made it late.
The rows now have `step max`, and each long frame also lists the costs of the frame before.

## Two full phone logs: trees landing, first blast, quality step, rain turn start (2026-11-18)

Two whole recorder files (Village, rain, upright, zoom 0.24, Ion Cannon; both from before the
look scan fix above) showed four single long ticks or frames.

- **"structures" ticks of 22 to 40 ms** while rock was falling. Not `supportPass`: a toppled
  tree that lands looped over every cell of the map looking for cells still carrying its group
  slot, and several trees land in the same tick after a wide blast. It now finds them with
  `indexOf` on the group layer. 3 to 6 ms a landing tick down to 0.8 ms (node, 1600x800), same
  results.
- **The Ion Cannon's impact tick, 14 to 44 ms in "shells".** Part of it was memory: the
  kernel's scratch arrays were only promised by the system until first written, and the prop
  groups allocated theirs (a dozen MB) at the first blast near a building. `Scratch` now writes
  its arrays once when made, and `Groups.prepare` does the same when props stand on a new map.
  Worst impact tick after the first run: 8 to 25 ms before, mostly 6 to 8 ms after (one run
  14 ms). The first run of a process is still 40 ms of cold code, which the client's warm-up
  covers.
- **A 209 ms frame (145 ms of script, nine shader links) when the quality stepped from high to
  medium.** `setQuality` builds the particles and the smoke anew, and their shaders were
  compiled again: 94 of 130 ms in headless Chromium at 6x CPU slowdown sat in
  `getShaderParameter` and `getProgramParameter`, which wait for the compile. `compileKept`
  keeps those programs for the life of the context: 27 ms, most of it `checkFramebufferStatus`
  for the new smoke fields. Live particles and smoke are still dropped at a step.
- **"turn end" of 7 to 14 ms at every turn start in rain.** Half of it was a walk down every
  column for the surface. `Grid.surfaces` reads the sky a row at a time, four cells a look,
  and walks only the last deep columns (0.78 to 0.38 ms), and the water count starts at the
  highest ground (0.39 to 0.25 ms). About 40% off the tick; it may still cost a frame.

None of this is measured on a phone.
