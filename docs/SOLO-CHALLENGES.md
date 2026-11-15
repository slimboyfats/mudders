# Solo challenges

A single-player ladder of set pieces: a fixed map, a fixed kit, a goal, and 1 to 3 stars. Start
screen → **Solo challenges** (`#challenges`, one challenge at `#challenge/<id>`).

## How it works

- Challenges are plain data in `packages/client/src/game/challenges.ts` (`CHALLENGES`), turned
  into ordinary `WorldOptions` by `challengeOptions`. The sim knows nothing about challenges.
  - **You** are player 0. The kit replaces the mode's loadout (`tankSetup.inventory`, the
    loadout's weapons set to 0).
  - **Targets** are foes with no `bot`: tanks left out of `turnOrder`, so they never take a turn.
  - **Bots** are foes with a `bot` (`ai.*`); they shoot back in turn order after you.
  - Fixed `seed` + `map` = the same map every attempt. `wind` fixes the wind, `twist` plays it
    under a round twist (Low gravity…), `weather` sets the sky.
  - One round, no shop, no sudden death, untimed unless `turnTimer` is set; `turnCap` 99 so the
    shot budget decides.
- `ChallengeRun` is the referee. It reads the world after every tick and counts your shots (one
  per turn of yours that reaches `resolve`). The challenge is **won** when every foe is dead and
  you are alive. It is **lost** if your tank dies, if the shot budget (`shots`) or the kit is
  used up while it is your turn again, or if the round ends some other way.
- Stars: clearing is ★. `stars.by: 'shots'` gives ★★★/★★ at or under the shot counts, and
  `'health'` gives them for health left (percent of what you started with).
- Progress is kept per device in localStorage `mudders.challenges.v1` as best stars by id. A
  challenge opens when the one before it is cleared. **Ids are permanent**, because saved stars
  are keyed by them.
- The match is a normal `LocalMatch` in `MatchView`. The challenge adds a banner (name, goal,
  shots, star goal, and a hint after 2 misses) and its own result card (`ownEnd` hides the HUD's
  match-over card).

## Adding a challenge

1. Add an entry to `CHALLENGES` in ladder order, with a new permanent id
   (`<chapter>.<name>`).
2. `pnpm vitest run packages/client/src/game/challenges.test.ts`: a target challenge must be
   cleared within its two-star shot count, either by the greedy solver (predicted direct hits)
   or by its stored `solution` (weapon, angle, power per shot). Puzzles that need special ammo
   (rollers, napalm, diggers) store a solution, found by a brute-force search over weapon,
   angle and power in the real sim. A bot challenge must be won by the test's perfect-aim
   player with plain missiles, so it can't be unbeatable.
3. To look at the map, write a scenario with the same seed, map, columns and inputs, and run
   `pnpm sim:preview <id>` or `pnpm capture <id>`.

## Ladder

- Range (still targets): First shot, Over the top (lob over the village mesa), Three cans,
  Headwind, Moon shot (Low gravity).
- Tools of the trade (special ammo): Roll call (Rollers into a valley), Firestorm (one Napalm,
  two targets), Bunker (Bunker Buster past the towers), Island hop (Heat Seekers on the
  floating islands), Hopscotch (Skippers past the peaks).
- Duels (bots shoot back): First blood (Moron), Sharpshooter (Shooter, and you start at 60
  health).
- Gauntlet: Two on one (two Tossers, you in the middle), Gale (Shooter in a 250% wind), Meteor
  night (Poolshark under falling rocks), Last stand (Cyborg).

## Next

- Use the new map events from the map-events thread (earthquake, cloudburst, flood, mud,
  electricity) as Gauntlet modifiers once they merge.
- Match awards and talking bots, if Joel wants them.
