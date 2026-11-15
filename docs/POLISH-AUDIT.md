# Mudders polish audit

_A rigid pass over the game as it stands on `main` (46e3779, core@0.39.0, kernel 0.18.x), 2026-11-08.
Findings only: nothing here is implemented. Each item has a priority, the evidence, and a concrete
proposal so it can be picked straight into a thread._

**How it was audited.** Read `docs/REQUIREMENTS.md`, `ARCHITECTURE.md`, the memory notes and the
client, sim and content code; ran `pnpm play:smoke` (emulated iPhone 14, S23+, laptop) and looked at
every screenshot; ran a headless match simulation (`packages/content/bench`, 4 AI mixes × 5 seeds,
2 and 4 players, 3 rounds) to measure pacing and the economy; read the reference weapon sheets.
Real-device feel, fps and audio mix are `needs-device` and are not claimed here.

**Priority key.** P1 = changes how the game feels or plays for every match; do first. P2 = clear polish
win, one thread each. P3 = nice to have, or needs a design call.

---

## 0. The ten things to do first

1. **Fix the snowball economy** (§1.1): the round winner earns $8–16k, the losers $10–100, so from
   round 2 on only one player can shop. Pay everyone a floor plus a share of damage taken.
2. **Make the HUD readable at fit zoom on a phone** (§3.1): tank numbers and health bars are drawn
   in map cells, so on a Medium map on an iPhone a tank is 9 CSS px wide and the "1" above it is
   unreadable. Draw tank badges in screen space.
3. **Give hits feedback** (§2.1): no damage number, no hurt sound, no hit flash on the tank. Only the
   health bar in the corner changes.
4. **Put a beat between turns and a round-end moment** (§2.2): the next turn starts on the exact tick the
   dirt settles, and a round ends straight into the shop with the result in a small header.
5. **Tune the Missile and the bots** (§1.2, §1.3): the unlimited Missile kills in two hits; Poolshark
   and Cyborg win 29 of 30 simulated rounds; Shooter and Moron never score.
6. **Shrink the 8-player chip stack** (§3.2): with 8 players the health chips cover a third of the map on
   a phone.
7. **Add the missing sounds** (§6.1): driving, shield hits, the sudden-death burn, drive blocked,
   timer running out, weapon select.
8. **Weapon descriptions in the match** (§3.4): the picker shows a name and a count only; the spec's
   long-press description is not built, so a new player cannot tell Quicksand from Terraformer.
9. **Replace the title-screen diagnostics** (§4.1): "WebGL2 ready / Lobby checking / Protocol v11" is
   the first thing a player reads.
10. **Make `play:smoke` reproducible** (§8.1): the drive step and the S23+ full-screen step both fail
    depending on seed and timing; seed the match and loosen the timing.

---

## 1. Gameplay and balance

Numbers below come from a headless simulation of `mode.classic` (3 rounds, opening shop, village
map 1200×600, 60 Hz). Five seeds per row.

| Bots                               | Players | Round length (s) | Play per match ex. shop (s) | Winner's money after 3 rounds | Losers' money |
| ---------------------------------- | ------- | ---------------- | --------------------------- | ----------------------------- | ------------- |
| Cyborg, Poolshark                  | 2       | 9–22             | 39–51                       | $8.4–9.3k                     | $0.7–1.8k     |
| Cyborg, Poolshark, Tosser, Shooter | 4       | 30–121           | 104–216                     | $13–16k                       | $0.1–4.3k     |
| Shooter, Poolshark                 | 2       | 12–54            | 79–116                      | $5.3–8.9k                     | $0.07–0.5k    |
| Shooter, Poolshark, Tosser, Moron  | 4       | 62–121           | 210–290                     | $14.6–16.6k                   | $0.3–6.6k     |

Average shot resolution was 1.8–2.7 s and the longest 7.2 s, so the "~3 s" rule (§3.3) holds for
almost every shot; the outliers are chain reactions and long settles, which is fine.

### 1.1 The economy snowballs: losers cannot shop (P1)

**Evidence.** `mode.classic` pays `moneyPerPoint: 30` on round points, and points are damage dealt

- 50 per kill + 25 survival + 100 round win. A round winner typically scores 250–450 points ($8–14k);
  a player who dealt no damage scores 0 or negative (self-damage is subtracted) and earns $0 plus 5 %
  interest on what they had. In every simulated 2-player match the loser could buy nothing after
  round 1. Starting cash is $3,000 and the cheapest useful upgrade (Roller $3,500, Napalm $5,000) is
  out of reach, so the first shop is mostly Baby Missiles and a Parachute.

**Why it matters.** The shop is the Scorched Earth loop: lose a round, buy something nasty, come
back. Here the loser's shop is empty, the winner buys a Nuke, and the match is decided after round 1.
The top third of the arsenal (Singularity $18k, Grim Crown $20k, Heavy Nuke $25k, Superstorm $30k,
Ion Cannon $40k) is unreachable in a standard 3-round match for anyone but a runaway winner.

**Proposal.**

- A per-round **participation floor** (e.g. $2,500) paid to every player, plus **points for damage
  taken** (half of damage dealt, or a "survived N turns" bonus), so a losing player still earns
  $3–5k a round.
- Cut `moneyPerPoint` for kills/round wins or cap round earnings (e.g. $9k), so the spread between
  first and last is ~2×, not 100×.
- A "catch-up" discount: the player with the lowest score gets 20 % off in the shop (Scorched Earth
  had the same idea with its interest option).
- Raise `startingCash` default to $5,000 or lower tier-1 prices so the opening shop has a real choice.
- Add a cheap "second weapon" to the loadout rotation, or make the opening shop show a
  **"Recommended for $3,000"** row.
- Show the money each player earned on the round scoreboard (it is there) **and** what it buys: a
  "You can afford: Roller, Napalm, Shield" line under the cash.

### 1.2 The free Missile is too strong, so rounds end in two hits (P1)

**Evidence.** `explosion.standard` is radius 24, damage 60; a direct hit kills a 100 hp tank in two
shots, and a tank is dead before the sudden-death zone (turn 8) ever moves. The §3.1 pacing budget
assumes ~8 turns per player per round; simulated rounds take 2–5 turns per player, and sudden death
was never reached in 30 rounds. Two-player rounds against a competent bot last 10–20 s.

**Proposal.**

- Make **Baby Missile** the unlimited default (30 dmg, r12) and give the loadout 10 Missiles instead
  (or keep Missile unlimited at 40–45 damage). Three to four hits to a kill is the sweet spot that
  makes shields, batteries and driving matter.
- Lower `scoring.kill` relative to damage so chip damage counts.
- Health 100 → consider 120 for everyone, or scale `deathExplosion` so death chains are the spectacle,
  not every second shot.
- Re-check the turn cap (12/player) after the change; it should rarely trigger but sudden death should
  bite about one round in three.

### 1.3 The AI spread is wrong: two bots own every match, two never score (P1)

**Evidence.** Poolshark won all 15 2-player rounds against Shooter; Cyborg won all 15 against
Poolshark. In 4-player games Shooter and Moron scored 0–130 points in a whole match. There is no
difficulty label, and the setup screen's default opponent is Shooter, which cannot hit anything
against hills and wind (it "ignores wind until it sees where the shell went" and brackets only on
power).

**Proposal.**

- Label bots with a **difficulty tier** in the setup/lobby select ("Easy · Moron", "Medium · Shooter",
  "Hard · Poolshark", "Brutal · Cyborg") and order them that way.
- Give Shooter wind compensation after its first miss and bracket on angle as well as power, so it
  lands within ~2–3 shots like a learning human.
- Add a deliberate error to Poolshark and Cyborg that **shrinks with the round** (big miss on turn 1,
  near-perfect by turn 5), which is also how a human plays and makes rounds last.
- Make the default opponent the Medium bot once it can hit.

### 1.4 No comeback or tension mechanics (P2)

The sudden-death zone, wind changes and the shop are the only tension sources, and §1.2 means the
zone rarely appears. Proposals, pick one or two: last-tank-standing gets a one-turn damage bonus;
"revenge" bonus points for hitting the leader; wind shown for the next turn too (a planning element
Scorched Earth never had); a round-start "bounty" on the top scorer.

### 1.5 Simultaneous-fire mode is still an open question (P3)

§12 suggests it as the mobile default. With §1.2 fixed, a 4-player sequential round is ~2 min, which
is fine. Leave it, but note that hot-seat on one phone makes passing the device the slow part: a
"pass to P2" screen between human turns (one tap, hides the previous player's aim) would help more.

---

## 2. Game feel

### 2.1 Hits have no feedback (P1)

**Evidence.** `damageTank` in the sim emits no event for damage taken (only `shieldHit`, `burn`,
`zoneHurt`, `rustHurt`), the renderer tracks no health delta, and the audio map has no hurt sound.
When a Missile hits, the explosion plays and the corner chip's number drops. Nothing on the tank
says "that hurt" and nothing says how much.

**Proposal.** Emit `tankHit {damage, player, by}` from `damageTank` (sim change, behaviour version
bump), then in the renderer: a 2-frame white flash of the sprite, a pixel-font **damage number**
that pops up 10 cells and fades (screen-space, see §3.1), a short hurt chirp, and a tiny screen kick
for direct hits. Also show **shield soak** as a number ("−18 shield") and a **kill** as a stamp
("P2 destroyed P3") that doubles as a kill feed for 4–8 players. Hit-stop already exists; use it on
kills only.

### 2.2 No beat between turns, no round-end moment (P1)

**Evidence.** `World.step` calls `endTurn()` on the first tick `quiet` is true, and `endRound()`
calls `openShop()` directly. The turn banner (1.6 s CSS animation) is the only transition. After a
kill the shop header reads "P1 wins" over the map with no pause; after the last round the "wins the
match" dialog pops instantly over the death explosion.

**Proposal.** Keep the sim deterministic and add a **client-side hold**: 400–600 ms after `quiet`
before the next turn's banner (the sim can stay as is if the client delays showing the banner and
the controls, but a real `mode.turnGap` in ticks is cleaner and keeps replays identical). On round end:
a 1.5–2 s "Round 2 · P1 wins · +$6,400" card over the settled map (slow-mo finisher already exists
for the kill), then the shop. On match end: the scoreboard after a short fade, with the winning tank
highlighted on the map behind it.

### 2.3 Bot turns are too fast to read (P2)

`BOT_THINK_TICKS = 50` (0.8 s), aim at 0.4 s, fire. The banner says "Shooter is aiming…" but the
barrel snaps and the shell is already in the air. Proposal: 1.2–1.5 s think, tween the barrel over
20 ticks (render-only), a short "charging" tick sound, and the bot's aim guide drawn like the human's
so the player sees where it is going.

### 2.4 Turn timer feedback (P2)

The timer badge turns red at 5 s (`timer low`) and nothing else happens; at 0 the shot fires with the
current settings. Add a tick sound for the last 5 s, pulse the FIRE button, and show "fired on
time-out" as a toast so the player understands why their tank just shot.

### 2.5 Camera (P3)

The spec rules out follow-cam; fine. Two small things: on a huge hit the zoom-punch is the only motion,
and after a kill at the far end of the map nothing draws the eye. A 1-frame flash of the wreck's
chip in the HUD, plus the kill stamp from §2.1, covers it. Also "fit" after the player has zoomed is
only on the ☰ sheet and the ⤢ button; a double-tap on the map to fit (and double-tap again to zoom
on the active tank) is the gesture people try first.

---

## 3. HUD and mobile UI

Screenshots: `pnpm play:smoke` output (`captures/play-smoke-*.png`).

### 3.1 Tank badges scale with the map and vanish on a phone (P1)

**Evidence.** `drawTanks` draws the player digit (`drawDigit`), the health bar (16 cells × 1.6) and
the active marker in **map cells**. At "fit" on an iPhone 14 landscape (750 CSS px) a Medium map is
0.58 CSS px per cell: the tank is 9 px wide, the digit 3 px, the health bar 9 × 1 px. In the
8-player screenshot not one digit is legible. The aim guide, by contrast, is DOM/SVG and reads
perfectly.

**Proposal.** Move badges to the SVG overlay that already draws the aim guide: digit (or the name),
health bar, shield bar, status glyphs (frost/glue/rust), the active bob marker, all at a fixed CSS
size with `project()`. Keep the sprite in the grid. This also makes the damage numbers of §2.1
trivial. The mobile default should also be **Small** on any phone, not only when the shorter side is
under 500 px (`defaultSetup`); the smoke runs Medium and it is clearly too small.

### 3.2 Player chips do not scale to 8 players (P1)

**Evidence.** `play-smoke-iphone14-5-eight-players.png`: a 2×4 grid of chips covers the left third
of the map down to the hills. The chips repeat the health that the tank badge shows.

**Proposal.** One row of compact chips (number + health bar, 56 px wide, no score) across the top,
score only in the ☰ sheet and the scoreboard; collapse to "P3 ▸" pills at 6+ players; the active
player's chip grows. Or drop the chips at 5+ players entirely once §3.1 badges are readable.

### 3.3 Weapon button truncates ("Baby Miss…") (P2)

The weapon pill is fixed-width in landscape; the most common weapon name does not fit. Allow two
lines or a smaller font for long names, or shorten display names (`meta.short`: "Baby M.", "H. Nuke").

### 3.4 No weapon description in the match (P1)

§8a asks for long-press descriptions; the picker has none. Add a description line under the grid
for the hovered/selected tile (the `description` is already in content), and a "?" that opens the
same card as the shop's. Categories ("Terrain Dynamics") are abstract to a new player; a one-liner
("pushes dirt and tanks outward") per tile is what helps.

### 3.5 Top bar density and the mystery badges (P2)

"R1/3", "Wind ▬ → 3", "17°", "15s" and the camera trio sit in a row. The temperature badge is a
number with no label until it hits a band; put "17 °C" with a thermometer glyph, or hide it unless
weather/temperature matters this match (it only changes fuel burn, frost and fire). "R1/3" →
"Round 1 of 3" on wide screens. Group the camera buttons away from the timer so a tap on "+" never
lands next to "15s".

### 3.6 Setup screen (P2)

- There is a stray 1-px vertical line to the right of the Player 1 card in landscape
  (`play-smoke-iphone14-6-tank-setup.png`); a card border or outline overflow.
- Tank type select ("Bruiser") sits under the slot with no hint of what it does until "About the
  tanks" is opened; show the one-line stat ("150 % health, half drive") inline.
- The AI select lists personalities, not difficulty (§1.3).
- "About 5 min with 2 players" is an estimate the simulation does not support (see §1); recompute
  after §1.2 and show a range.

### 3.7 Drive controls (P2)

The ◀ 40 / fuel 80 ▶ cluster is always visible, including when a tank cannot move (glued) and for
tanks on maps where driving is pointless. §8a says the buttons appear only when fuel is available.
Keep them, but grey the cluster to a single "⛽ 40" chip until the first press, and show a **ghost
tank** at the reachable end while a drive button is held (the sim already has `reach()` for bots).

### 3.8 Shop (P2)

Good already (filters, sticky Ready, timer). Remaining:

- 75 weapons + gear in one grid; the first screen is Fuel, Parachute, Battery, Shield, Heavy
  Shield, Tracer. Lead with **"Recommended"** (3–4 affordable weapons that counter the map or the
  leader), then categories.
- No way to **undo** a purchase (sell back at full price until Ready). Mis-taps on a 30 s timer are
  common.
- The round scoreboard is a collapsed `<details>`; show the round result as a card above the grid
  (one line per player with money earned) so the shop doubles as the round-end screen (§2.2).
- Hot-seat: after P1 taps Ready the shop switches to P2 silently; show a "Pass to P2" interstitial.
- Hide the 30 s countdown's last 5 s red state behind a sound as well (§2.4).

### 3.9 Portrait phone (P2, verify on device)

Covered by the smoke only on the iPhone 14 portrait run; check the dock's two rows leave the map at
least 40 % of the height and that the weapon pop-up does not cover the FIRE button.

---

## 4. Screens and flow

### 4.1 Title screen shows diagnostics (P1)

"WebGL2 ready · Lobby checking · Protocol v11" are developer lines. Move them to Settings → About,
and show only a one-line problem when there is one ("This browser can't run Mudders: WebGL2 is
missing"). Replace with a rotating tip or the last match result.

### 4.2 No first-run help (P2)

There is no how-to-play anywhere. Add a 4-card "How to play" sheet on the title screen (aim with the
pills, FIRE, wind, shop) and a one-time coach mark on the first turn ("Slide the angle pill").

### 4.3 Names (P3)

Local play uses P1–P8 everywhere (chips, banner, shop, scoreboard); online players have names. Let
hot-seat players type names on the setup screen (persisted), and use them in the banner and kill
stamps. It makes "P2 destroyed P3" read as a story.

### 4.4 Spec items not built (P3, decide)

- Replay of the last shot (§8): free with determinism; a "↺ last shot" button on the ☰ sheet.
- Text chat in online play (§8): at least canned emotes ("gg", "nice shot").
- Rebindable keys (§8): a Settings section.
- Long-press weapon description (§8a): see §3.4.
- Host migration (ARCHITECTURE §7): the match ends when the host leaves.

---

## 5. Weapon effects and terrain

The arsenal is broad (75 weapons) and the terrain dynamics are the game's best part; most of these are
consistency notes.

### 5.1 The impact flash is a soft radial glow (P2, taste call)

`captures/reference/weapon-showcase.weapon.missile-sheet.png` frame 1: the Missile's flash is a round,
smoothly feathered halo. CLAUDE.md and Joel's earlier feedback want hard bands or dither on the grid.
Proposal: quantise the flash to 3 bands with a 2×2 dither edge, like the shockwave ripple.

### 5.2 Shell trails are smooth hairlines (P3)

The faded trail of the previous shot is an anti-aliased 1-px arc; the live trail is on the grid.
Draw the faded one as dotted grid cells too, so both read as the same object.

### 5.3 Explosion scale vs. map readability (P2)

Big weapons (Ion Cannon r200, Superstorm r400) blank most of a Small map in white or smoke for
seconds. §2a says effects must not obscure the map for more than a moment. Cap whiteouts at ~0.5 s
on Small, and scale `shake` down on phones (it is already behind a setting; default it to "light").

### 5.4 Death wall at round start (P2)

The sudden-death fallout wall is drawn at both edges from turn 1 (the dark particle columns in every
screenshot), before sudden death exists. It reads as a rendering bug on a fresh map. Fade it in only
from the first `zoneGrow`, with a one-turn warning line.

### 5.5 Crater and dirt feel (P3)

Falling dirt is animated and bounded; fine. Two small things: a dirt ball landing on a slope flows,
but there is no dust puff where it lands (`land` fires only for shells); and quicksand slumps without
a sound after the initial one. Both are content-level (`effects`/`audio` on the item).

### 5.6 Per-weapon audio (P3)

70 of 104 weapon manifests declare no `audio`; they fall back to the generic `muzzle` and
damage-type sounds, which is fine for explosives but makes every earthmover and terrain weapon sound
like a missile on firing. Give each category a `fire.*` profile (soft thump for dirt, hiss for
beams, whine for guided) via `use`, so it is one line per manifest.

---

## 6. Audio

### 6.1 Events with no sound (P1)

Sim events the renderer or HUD shows but the audio map ignores: `drive` (engine), `driveBlocked`,
`shieldHit` (the shield soaks with no sound), `zoneBurn` (sudden-death damage), `iceCage`,
`pocketBurst`, `tsunami` start, `reflect` (laser mirror), `glued`/`frosted`, `tornado` start, and
there is no sound for weapon select, the turn timer's last seconds, or a tank taking damage (§2.1).
All are `audio.*` manifests with an `on` entry; no code.

### 6.2 Music (P2)

Two tracks, title and battle; the battle loop plays through the shop and the match-over screen too.
Add a shop tune (or a quieter arrangement of the battle theme), a 3-second win sting, and a
sudden-death variant (faster tempo, same pattern) that starts on the first `zoneGrow`.

### 6.3 Mix (P3, needs-device)

`MAX_SOUNDS = 12` and per-id gaps are sensible. A nuke chain can still stack 12 booms; duck music by
6 dB during big blasts and treat `flash` strength > 1 as a single master boom.

---

## 7. Online and lobby

Not played in this audit beyond code reading; `play:net` passed in earlier threads.

- The lobby shows the room code and a copy/share link; good. Guests have no "ready" state and no
  chat; a "👍 ready" toggle per seat gives the host a reason to press Start.
- "AI plays for them after 10/20/60 s" is the only disconnect option shown; fine, but surface the
  takeover in the match as a banner ("P3 lost connection, Poolshark is playing") instead of a silent
  bot name on the chip.
- Lobby cold start on Render takes tens of seconds; the title screen says "Lobby checking" with no
  spinner or ETA. Show "Waking the lobby server (up to 60 s)…" with a progress hint, per §7.

---

## 8. Bugs found

### 8.1 `play:smoke` is flaky: "holding drive did not move the tank", and a fullscreen time-out (P1)

Known to fail on main in the tank-type match step (Bruiser, `#play` with a random seed). In this
audit's run the iPhone 14 drive step **passed** (gauge 20 → 18, fuel 80 → 78, see
`play-smoke-iphone14-8-driving.png`), and the run failed on the S23+ instead: the full-screen toggle
never set `document.fullscreenElement` within its 2 s budget (`page.waitForFunction: Timeout 2000ms
exceeded`). So the suite has two map- and timing-dependent steps, not one bug.

Drive step, likely causes in order: the Bruiser spawns against a step higher than `drive.climb` (3)
so `driveStep` emits `driveBlocked` on the first cell (the match seed is `Math.random()` in
`Play.tsx`, so it is map-dependent); or P1 only just got the turn and `canAim` is false for a frame
when the synthetic `pointerdown` lands. Fix: seed the smoke match (`#play/2/medium?seed=`) so it is
reproducible, drive toward the side with room (the sim's `reach()` gives it), and give `driveBlocked`
HUD feedback (a shake of the ◀/▶ button) so a human also sees why nothing happened. For the
full-screen step: wait on the `fullscreenchange` event with a longer budget under SwiftShader, or
skip the toggle when `document.fullscreenEnabled` is false.

### 8.2 Stray artefacts (P3)

- A 1-px white vertical line beside the Player 1 card on the landscape setup screen.
- A short white dash at the right map edge in the 8-player screenshot (death-wall particle above the
  sky band).
- The weapon pop-up grid leaves ~60 % empty space with the starter loadout; collapse to the rows used.

---

## 9. Suggested order of work

| Thread                              | Items                        | Effort                                          |
| ----------------------------------- | ---------------------------- | ----------------------------------------------- |
| Economy + balance pass              | §1.1, §1.2, §1.3, §1.4       | content + mode numbers, one sim test, pack bump |
| Hit feedback + turn beats           | §2.1, §2.2, §2.3, §2.4       | one sim event, renderer + HUD, audio items      |
| Screen-space tank badges + chip row | §3.1, §3.2, §3.3             | renderer/HUD, play:smoke update                 |
| Missing sounds + music              | §6.1, §6.2, §5.6             | content only, `audio:preview`                   |
| Title, help, names, shop touches    | §4.1, §4.2, §4.3, §3.4, §3.8 | UI only                                         |
| Smoke drive fix + artefacts         | §8.1, §8.2, §5.4             | small                                           |
| Effects consistency                 | §5.1, §5.2, §5.3             | renderer, captures for approval                 |

Each row is one PR-sized thread. The first three change what every match feels like; the rest are
polish in the usual sense.
