# Noita feel: research and gap list

Joel's direction (2026-11-10): the _feeling_ of Mudders should move toward Noita (Nolla Games, 2020),
the falling-sand roguelite whose pitch is "every pixel is simulated". This doc is findings and
proposals only. Nothing here is built yet; Joel picks.

Rule 10 still applies: we take the _feel_ (systems that interact, a world that reacts), never
names, art, materials lists, text or audio from Noita.

## 1. What makes Noita feel the way it does

### 1.1 The simulation

- **Every cell is a material.** A custom engine ("Falling Everything", C++) simulates the world per
  pixel in the falling-sand tradition: static solids, powders that pile, liquids that flow and
  level out, gases that rise and thin out. The developers cite falling-sand toys such as The Powder
  Toy as the root.
- **Scale through chunks.** The world is split into 64×64 chunks, each with its own dirty rect, and
  updated on several threads in a checkerboard so neighbouring chunks never race. Only what moves
  costs anything. (Mudders already has the same idea: settle, react and structure boxes.)
- **Three kinds of moving matter.** Cells in the grid; free _particles_ (a blasted cell flies as a
  particle and becomes a cell again where it lands, like our `DebrisPool`); and _rigid bodies_.
  A piece of solid that loses its connection is cut out of the grid and becomes a Box2D body that
  falls, rotates and tumbles; each of its pixels remembers its body and offset, and when pixels are
  destroyed the body's shape is recomputed and may split in two.
- **Reactions are data.** Materials live in one big data file. A reaction lists input cells,
  output cells and a rate, e.g. lava + water → rock + steam. Reactions match on _tags_ as well as
  ids (anything tagged as fire, anything tagged as water), so a new material joins every existing
  interaction by tagging it. Materials also carry hardness (per-pixel HP), burnability, a lifetime
  (mists and gases) and a _stain_ effect.
- **Fire is a process, not a colour.** Burnable cells catch, burn for a while, spread to burnable
  neighbours, give off smoke and leave something behind. Oil floats on water, so a burning slick
  rides on a lake. Flammable gas pockets go off when fire or lava reaches them.
- **Stains and statuses.** Liquids stain whoever touches them: wet (puts out fire, conducts),
  oiled (burns harder), and so on. Water conducts electricity, so a spark in a lake hurts
  everything in it.
- **Liquids persist.** A lake stays a lake. Liquids level out, sit in layers by density and are a
  resource you can move, drain or ignite.

### 1.2 The look

- **One pixel scale for the world.** Terrain, debris, liquids and gas share the same grid; physics
  objects stay on that grid even when rotated. Characters and projectiles may sit between pixels,
  and lighting runs at screen resolution rather than world-pixel resolution.
- **Material texture.** Solids are drawn from a material texture laid over the world, so brick
  looks like brickwork and wood like grain; powder and liquid grains keep their shade while they
  move, so a falling heap reads as _stuff moving_ rather than a pattern sliding under a mask.
- **Light and darkness.** Caves are dark; fire, lava, glowing materials and spells are the light
  sources. Glowing things bloom. Darkness is a big part of why fire feels precious and scary.
- **Density.** A single explosion throws hundreds of grains, sparks, smoke cells and liquid drops,
  all of which _land_ and become part of the world. Most of the "particles" you see are matter.

### 1.3 The sound

- FMOD-driven, with sound design by Niilo Takalainen and music with the band From Grotto. We found
  no primary source on how Noita wires material sounds, so treat this part as observation: the
  world _hums_ — fire crackles while it burns, liquids gurgle while they flow, debris patters as it
  lands — on top of one-shot impact sounds. The soundscape follows how much of each process is
  happening, not just which events fired.

### 1.4 Why it feels alive

1. **Everything touches everything.** A small number of rules (burns, flows, conducts, dissolves,
   freezes) applied to every material give combinations nobody scripted.
2. **Consequences outlast the shot.** Fire keeps spreading, a lake drains into the cave you just
   opened, gas leaks and finds a spark. The world keeps moving after you act.
3. **The player is inside the chemistry.** The famous Noita deaths are self-inflicted: you lit
   the oil you were standing in. Stains make the player part of the system.
4. **Matter, not effects.** What flies around mostly lands and stays, so the map records the fight.

## 2. Where Mudders is today

Already close to Noita (no work needed, or polish only):

- Falling-sand grid with static / fall / slide / flow settle kinds, dirty regions, bounded budgets
  (`sim/src/settle.ts`, ARCHITECTURE §3.2).
- Debris particles that land as terrain (`DebrisPool`), debris chunks.
- Data-driven pairwise reactions with chance, `spawn` into air, tick and turn decay, coatings that
  react (`reactions.ts`, §3.2b): water quenches lava to rock, oil and tar burn, gunpowder and reactor
  cells chain-detonate, clay fires to brick, plasma glasses sand, frost and snow melt.
- Denser liquids sink through lighter ones (oil floats on water).
- Structural integrity: props tear by span and weight, terrain overhangs drop by span × thickness
  (`groups.ts`, `support.ts`).
- Renderer: GPU single-pixel particles, Eulerian GPU smoke/gas fluid, liquid surface waves and
  sheen, heat haze, banded dynamic lighting from blasts plus a heat field for lava and flames,
  stepped colour fades, terrain flecks, weather, temperature.
- Chiptune audio with event-driven synth SFX and tracker music.

The real gaps, from reading the code:

- **No gas phase in the sim.** Smoke, steam and gas are renderer-only fluid; the grid has no cell
  that rises. Water + fire turns water into _air_, water + lava gives rock and _air_.
- **Fire does not move.** `material.fire` is `static`; it decays to ash after 48 ticks and only
  spreads to wood, leaf and splinter. Grass, moss, oil and tar each need their own pair rule.
- **Liquids do not persist and move slowly.** Water decays into air after 240 ticks ("soaks away"),
  and flow moves at most one cell sideways per tick, so pools never form lakes and spreading looks
  syrupy.
- **Reactions are pairwise by id.** Every new material needs explicit rows against every other one;
  there are no tags, so interactions grow by hand and many combinations simply do nothing.
- **No electricity through materials.** Lightning, Ion Cannon and the EMP hit tanks but don't run
  through water or metal.
- **Tanks aren't stained.** Statuses exist (glue, chill, shield), but touching water, oil or mud
  does nothing to a tank.
- **Grains don't keep their shade.** Terrain grain is a hash of the cell's _position_
  (`shaders.ts`, `hash(ap)`), so a falling heap of sand shimmers through a fixed pattern instead of
  grains carrying their colour down.
- **Falling chunks don't rotate.** Props drop as rigid blocks that only translate; terrain overhangs
  turn into loose debris cells. Nothing tumbles.
- **The world must go quiet.** A turn ends only when nothing moves (`World.quiet`), so any
  long-lived process (a forest fire, a draining lake) stalls the game. This is the main design
  tension with Noita and shapes several proposals below.
- **Sound is event-only.** No sound follows ongoing processes (burning, flowing, hissing).
- **Light is only warm.** The heat field lights in one orange; plasma, acid, crystal and reactor
  cells don't glow, and no map is dark enough for light to matter.

## 3. Proposals, ranked

Ranked by how much "alive" each buys per unit of work. Effort: **S** one small PR, **M** one thread
of work, **L** several PRs. "Kernel" means a kernel version bump and new golden hashes; per rule 3
and 5, behaviour lands as new material ids or new manifest fields, never as special cases.

All visual parts follow the look rules: whole map cells, hard bands and dither, stepped colour, no
smooth glows or blobs.

### Tier 1: the chemistry (biggest change in feel)

1. **Reaction tags.** Materials get `tags` (`burns`, `wet`, `hot`, `conducts`, `dissolves`,
   `meltable`, …) and reactions may match a tag instead of an id. Tags resolve at load time into
   the existing flat per-pair table, so the hot loop doesn't change. Every later proposal gets
   cheaper, and existing materials start meeting each other. _Effort S–M. Touches:_ `shared` schema,
   `sim/src/content/resolve.ts`, `materials.ts`, material manifests, `content:validate`.
2. **Gas phase in the sim.** New settle kind `rise`: the cell moves up or sideways into air, drifts
   with the wind, and has a lifetime. New materials: steam (water + fire or lava now make steam,
   not air), flammable swamp gas (goes off on contact with fire), and a heavy toxic gas that sinks
   into craters. Gas cells feed the GPU fluid as dye, so they look like the smoke we already have,
   but they are real and can be ignited, blocked by walls and trapped in caves. Lifetimes stay
   short or gas is exempt from `quiet` (see 5). _Effort M, kernel. Touches:_ `settle.ts`,
   `reactions.ts`, new material items, `fluid.ts` coupling, golden hashes.
3. **Fire as a process.** A `burn { hp, into, smoke }` field: any burnable cell (wood, leaf, grass,
   moss, oil, tar, gunpowder, splinter) catches from anything tagged `hot`, burns for `hp` ticks,
   spreads to burnable neighbours, emits flame cells that flicker upward for a few cells (rise with
   short life) and gas smoke, and leaves ash, scorch or nothing. Replaces most fire pair rules with
   one rule. _Effort M, kernel. Touches:_ `reactions.ts`, fire/burning materials, `lighting.ts`
   heat field (more sources), audio (see 11).
4. **Liquids that stay and level out.** Drop water's 240-tick decay and replace it with soaking:
   porous ground (sand, dirt, ash) slowly drinks water and turns wet or muddy, rock, clay and
   concrete hold it. Flow gets a per-material `disperse` (cells per tick sideways, water 4–6, lava
   1–2, tar 1) so water runs and lava creeps. Maps get real lakes and underground pools to drain,
   boil, poison or electrify. Needs a settle rule that stops a level pool from jittering so `quiet`
   still arrives. _Effort M, kernel. Touches:_ `settle.ts`, water/mud/liquid-dirt manifests,
   generators (lakes, cave pools), bench (wider settle regions).
5. **Background processes that don't hold the turn.** A material flag `ambient` (smoulder, gas,
   drips, slow lava creep) keeps reacting and moving during the next player's aim, without blocking
   `quiet`. Still fully deterministic and hashed, since the sim keeps ticking during aim anyway.
   The world keeps living between shots instead of freezing. Needs a per-tick budget cap so phones
   stay under 2 ms. _Effort M, kernel. Touches:_ `world.ts` (`quiet`), `grid.ts` (a second, budgeted
   region), bench, `play:net` (desync check).

### Tier 2: the player inside the system

6. **Tank stains.** Touching a liquid or gas stains the tank for a turn or two: wet (immune to
   burn, conducts electricity), oiled (burns longer and harder), muddy (drive costs more fuel),
   burning (damage each turn, sets fire under the tank), frozen exists already as chill. Small HUD
   icons and a stained tank tint. This is where self-inflicted deaths come from. _Effort M, kernel.
   Touches:_ `Tank` (hashed), contact pass in `world.ts`, `Hud.tsx`, tank shading.
7. **Electricity through materials.** Damage type `shock` floods through cells tagged `conducts`
   (water, metal, wet ground) from the hit point with a preallocated `Int32Array` queue, capped by
   distance, and hurts every tank touching the flooded cells (wet tanks always). Lightning into a lake
   or onto a rebar building becomes a trap. Visual: a jagged single-cell spark crawl through the
   conductor. _Effort M, kernel. Touches:_ `sim` (shock flood op), lightning/ion/EMP explosions,
   a renderer effect event.
8. **Material flasks.** A data-only weapon family that throws a payload of material and nothing
   else: water, oil, acid, swamp gas, mud, sand. Each does little alone; the fun is in the follow-up
   shot (oil, then fire; water, then lightning). Plus `material.acid`, a liquid that dissolves
   anything tagged `dissolves` into gas. _Effort S per item, content only (after 1, 2 for gas).
   Touches:_ `core/weapons/*`, `core/materials/acid`, docs, changelog.

### Tier 3: the look and the sound

9. **Grains keep their shade.** A cosmetic per-cell shade byte (2–3 bits of variant) that moves
   with the cell in settle and debris, set from the cell's spawn hash, and used by the terrain
   shader instead of the position hash for powders and liquids. A falling heap then reads as
   thousands of grains, which is most of the Noita look in motion. Excluded from the state hash.
   _Effort S–M. Touches:_ `grid.ts` (new layer), `settle.ts`, `debris.ts`, snapshot, `TERRAIN_FS`.
10. **Coloured glow and dark maps.** `look.emit` on any material (plasma violet, acid green,
    crystal cyan, reactor white, lava and fire orange) feeds the heat field as a coloured light
    field; still banded and dithered. Add one or two dark themes or a "night caves" map where the
    sky is black and the only light is what burns or glows, so fire becomes precious and scary.
    _Effort M, render-only. Touches:_ `lighting.ts`, `shaders.ts`, material manifests (cosmetic),
    `core/themes`.
11. **Process soundscape.** The sim exposes cheap per-tick counters in the snapshot (cells burning,
    liquid cells moved, quench reactions, debris landed; not hashed). The audio engine drives a few
    looping chip voices from them: crackle (gated LFSR noise), hiss for quenching, a low pulse
    gurgle for flowing liquid, a patter for landing grains. Volume follows the count, so a forest
    fire _sounds_ big. Chiptune only, synth patches with a recorded licence. _Effort M. Touches:_
    `sim` snapshot counters, `shared` snapshot type, `audio/engine.ts`, new `audio.*` items,
    `audio:preview`.
12. **Liquid splatter as matter.** Blasts and impacts in a pool throw real liquid cells as debris
    (they land as liquid), and splashes leave short-lived stains as coatings (wet dark, soot,
    lava speckle) on nearby walls. The renderer splash stays for spray; the sim carries the
    matter. _Effort S–M, kernel. Touches:_ `explode` debris spawning, coatings, `splash.ts`.

### Tier 4: bigger structural work

13. **Tumbling chunks.** When a piece of terrain or a prop tears off, keep it as a rigid chunk that
    rotates as well as falls: integer rotation of its cells by three shears (no trig in the sim,
    table angles only), redrawn onto the grid each step, broken into debris on a hard landing. Walls
    topple, slabs slide off cliffs. This is the single most Noita-looking thing we lack, and also
    the most expensive and riskiest for determinism and settle budgets. _Effort L, kernel.
    Touches:_ `groups.ts`, `support.ts`, new chunk store in `sim`, renderer, bench, golden hashes.
14. **Dirt and clay lips.** Finish the structural engine's step 2 for `fall` materials: dirt holds a
    small overhang and caves in, clay holds more (already scoped in the structural thread). Makes
    tunnels and caves collapse naturally. _Effort M, kernel. Touches:_ `support.ts`, material
    `span` for fall kinds.
15. **Per-cell heat.** A real temperature byte per cell that diffuses over the react region
    (melting ice, boiling water to steam, cooling lava from the edge in). Noita mostly fakes this
    with reactions, and tags plus 2 and 3 get us most of the way, so this is last. _Effort L,
    kernel._

### Suggested order

Tags (1) → gas (2) → fire (3) → liquids (4) is one coherent "chemistry" track; each is a small PR
and each is visible on its own. Grain shade (9) and coloured glow (10) are independent render
tracks that can run in parallel. Background processes (5) and stains (6) should follow once gas
and fire exist, since that is what they'd mostly carry. Tumbling chunks (13) only after the rest.

### Risks to watch

- **Turn length.** More living matter means more ticks before `quiet`. Proposal 5 is the answer;
  without it, keep lifetimes short.
- **Phone budget.** Gas and fast liquids widen the settle and react regions. Every kernel step
  above needs a `pnpm bench` case and a cap.
- **Determinism.** All of it stays integer, hashed, without transcendental `Math.*`; rotation in 13
  uses shear tables.
- **Readability.** Noita is a single-player game; Mudders is a duel. Chaos should stay readable from
  the opposite side of the map, so chain reactions keep the existing SFX gaps and the HUD should
  say what killed a tank (burned, drowned in acid, electrocuted).

## Sources

- Petri Purho, "Exploring the Tech and Design of Noita", GDC 2019 Independent Games Summit:
  [GDC Vault](https://gdcvault.com/play/1025695/Exploring-the-Tech-and-Design),
  [free on YouTube](https://www.youtube.com/watch?v=prXuyMCgbTc),
  [discussion and summary](https://tildes.net/~games/hsh/exploring_the_tech_and_design_of_noita).
- [Road to the IGF: Nolla Games' Noita](https://www.gamedeveloper.com/game-platforms/road-to-the-igf-nolla-games-i-noita-i-) (Game Developer).
- [Noita (video game)](<https://en.wikipedia.org/wiki/Noita_(video_game)>) (engine, Box2D, FMOD,
  falling-sand inspiration).
- Noita community wiki, used for reactions and statuses:
  [Reaction docs](https://noita.wiki.gg/wiki/Documentation:_Reaction),
  [Lava](https://noita.wiki.gg/wiki/Lava), [Gas](https://noita.wiki.gg/wiki/Gas),
  [Flammable Gas](https://noita.wiki.gg/wiki/Flammable_Gas), [Light](https://noita.wiki.gg/wiki/Light),
  [Credits](https://noita.wiki.gg/wiki/Credits).
- Rendering observations (world pixels on grid, lighting at higher precision):
  [r/howdidtheycodeit thread](https://www.reddit.com/r/howdidtheycodeit/comments/1jbb5ij/).

The wiki pages could only be read through search snippets from this session (the wiki host is
outside the network allow-list), so specific reaction rates are not quoted. The sound section is
observation, not sourced.
