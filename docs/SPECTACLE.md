# Spectacle: shots and blasts

Thread "Add more spectacle to shots and blasts" (2026-11-15). Joel saw the explosion designs
(#181-#184), per-weapon shell looks (#185) and clouds that react (#186) and asked for more ideas
in the same vein. Everything here is **renderer only**: it reads effect events and snapshots,
never feeds back into the sim, and needs no content or golden change.

## Firing kick (`client/src/render/pixel/muzzle.ts`)

- Heft per weapon, 0.1 to 1: `muzzleHeft()` in `client/src/game/palette.ts`, from the biggest
  blast the weapon or anything it spawns sets off (vs the 24-cell standard blast) and the price
  per shot as a floor. Shipped as `RenderPalette.muzzles` by weapon index, the same index the
  sim's `muzzle` event carries in `params.weapon`. Captures pass it through `WireInit.muzzles`.
- Flash: a pixel tongue along the aim (spade-shaped, core / hot / edge / ember bands, ragged
  edge cells), 2 to 5 ticks, that tears off the muzzle and cools; heft >= 0.4 adds two short
  muzzle-brake jets. The old soft glow stays small (r 6 to 14).
- Recoil: `recoilAt(heft, age)` cells the barrel is drawn pulled back (1 to 4), held 2 to 4 ticks
  then eased out. Heft >= 0.5 rocks the hull one cell back for 2 to 4 ticks and kicks the shake.
- Dust: puffs off the surface around the tank (never under the hull), reaching further on the
  side the barrel points, clods for heft >= 0.45. The air gets two fluid splats (a push along the
  barrel and a radial push at the tracks): without them the Dust particles barely move, because
  they follow the still air.

## Blast skirts (`skirt.ts`)

- Ground blasts with radius >= 10 (`SKIRT_MIN_RADIUS`) whose ground is close below send two fronts
  out from just past the crater rim (radius + 2). Fronts start on the surface there, not on the
  crater floor (the flash event comes after the crater is cut, so starting inside it stopped the
  fronts on the crater wall at once). Each front moves cell by cell along the surface, climbs at
  most 4 rows per cell, brakes by 0.94 a tick and drops Dust puffs plus grit, with a small fluid
  push so the dust keeps rolling.
- Dust colour for all of this (`groundDust()` in the renderer) is the ground colour mixed 55%
  toward a pale tan: plain or darkened ground colour vanished against the ground.

## Steam (`steam.ts`)

- On a blast, `wetSurface()` finds up to 40 cold-liquid surface cells within radius × 1.3. Those
  vents boil for 40 + radius × 1.5 ticks, starting 8 ticks after the bang. Puffs spawned at the
  bang itself were swallowed by the fireball's air and never showed.
- Steam uses `PKind.Plume` in a blue-grey that steps lighter: `PKind.Smoke` is ember-lit
  when fresh, so pale smoke read as more soot.
- Burning shells (`HOT_SHELLS` shell looks fire, meteor, plasma, star, and the `flask` flight)
  hiss once when they enter water.

## Tank flinch (`flinch.ts`)

- Tanks within radius × 2.6 + 10 of a blast (strength by distance and size) are drawn shoved
  away 1-2 cells and hopped up a cell or two over 14 ticks, starting when the blast front
  reaches them (6 cells/tick), with dust shaken out from the tracks.

## Capture tips

- A one-shot scratch scenario with `maxTicks` about 70 and `untilSettled: false` captures in
  about 40 s; a three-turn one took 7 min. `--zoom 4 --center <tank x + 15>,<ground y>` frames it.
- Queued inputs for later players did not fire in a three-tank scratch scenario; use one
  scenario per shot.
