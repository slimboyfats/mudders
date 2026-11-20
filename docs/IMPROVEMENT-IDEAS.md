# Improvement ideas from similar games

Research note, 2026-11-20. Joel asked for a look at similar games and a list of improvements in
gameplay, weapons, logic, UI, audio, visuals and physics. Nothing here is built. It is a menu to
pick from.

How to read it:

- **Effort** is S (one small PR), M (a few PRs) or L (a track of its own).
- **Phone** says what the idea costs on a phone: _free_ (no per-frame work), _light_, or _heavy_
  (needs a budget and a `pnpm bench` case).
- **Where** says what it touches: content only, kernel (changes golden hashes, needs a version
  bump), client, or protocol (old and new clients cannot play each other).
- Ideas borrow the _mechanism_ from another game, never its names, art, text or sound (rule 10).
  Working names here are placeholders of our own.
- "Not in the game today" was checked against the code and docs on this date (main at #253). The
  facts about other games come from the sources at the end where one is listed, and otherwise
  from general knowledge of those games, so treat the details as pointers, not as quotes.

Already in the game and so left out: hit callouts, hit-stop and screen shake, the slow-motion
finisher, bounty and comeback cash, round twists, map shuffle and map events, supply crates,
second-press (DROP!) shells, bot difficulty and talking bots, match awards, training coach, solo
ladder, shop search and previews, day and night, wildlife, far zoom, tank stains, electricity
through water and steel, acid and flasks, liquids with momentum, falling slabs and toppling trees.
The Noita gap list ([`NOITA-FEEL.md`](NOITA-FEEL.md)) and the polish audit
([`POLISH-AUDIT.md`](POLISH-AUDIT.md)) are not repeated; where an idea continues one of theirs it
says so.

## 1. What the other games do well

- **Worms series (Team17).** Movement is a skill of its own (rope, jumps, parachute), and a short
  retreat time after firing makes every shot a risk. Each player has several units, so nobody is
  out early. Barrels and mines lie on the map and start chain reactions. Named rule sets
  ("schemes") are shared between players. Sudden death can raise the water or drain health.
  Weapons have settings (fuse time, bounce). W.M.D added buildings to shelter in and crafting.
- **ShellShock Live.** A turn mode where everyone fires at once. A dashed tracer of your last
  shot. Many modes (points, one against all, rebound walls, portals). Weapons level up into
  stronger versions, and 100 ranks unlock tanks and gear.
- **GunBound.** Turn order comes from a delay number: heavy shots, items and slow thinking push
  your next turn back. Every vehicle has three shots, the third charged up by fighting. Wind
  shifts every few turns and one point of wind matters.
- **Pocket Tanks.** No health and no deaths: both players fire a fixed number of shots drafted
  from a shared pool, and the most points wins. Nobody ever waits out a round.
- **Scorched Earth and its open-source heirs.** Wall rules (bounce, wrap, none), tracers, guidance
  systems, shields of several kinds, batteries, interest on unspent cash, taunts from text files.
- **Tank Stars.** One thumb, very short matches, each tank with its own ability. The loop is
  simple and reviewers say it gets old in days: a warning that variety has to come from the
  world, not from menus.
- **Liero.** Five weapons picked from forty before the match, recoil that moves you, a rope that
  can hook the other player.
- **Noita.** Covered in `NOITA-FEEL.md`. Two lessons not used yet: weapons assembled from parts
  (a modifier applies to the next spell, a trigger casts the next spell where the first one
  lands), and rigid pixel bodies that break where they are hit.
- **Forts.** Structures carry load and fall when a strut is cut. A built-in replay with slow
  motion and export to video or GIF.
- **Rocket Bot Royale.** A browser game with tanks on destructible, sinking islands, rocket
  jumps, buried treasure to dig for, and a rule set that changes daily.

## 2. Top picks

Ranked by how much each changes the feel of a match for its cost, with Joel's goals in mind:
real-life physics in pixel art, a living world, and speed on a phone.

1. **Cover counts: blasts are blocked by solid ground** (§8.1). _Built 2026-11-20 as the match
   rule `cover`, see `REQUIREMENTS.md` §3.5._ Today damage is by distance only,
   so a tank behind a rock wall is hurt the same as one in the open. Real blasts are not like
   that, and this one rule gives every wall, trench and dirt weapon a defensive use. M, kernel.
2. **Things on the map that react** (§3.9): fuel tanks, water towers, power pylons, powder
   stores, dams. They use the chemistry that already exists, so each is content only. S each.
3. **Volley mode: everyone fires at once** (§3.1). Halves the waiting, which matters most on a
   phone and online. L, kernel and protocol.
4. **Instant replay and "shot of the match"** (§6.1). The spec already asks for it and
   determinism makes it nearly free. M, client only.
5. **Shells that care what they hit** (§8.2): ricochet off rock and steel at flat angles, skip on
   water, bury into mud and snow before going off. M, kernel. _Built 2026-11-20 as the match rule
   `shells`, see `REQUIREMENTS.md` §3.4._
6. **Weapon mods** (§4.1): a few add-ons (split, bounce, fuse, "carries the next shell") that
   work on most shells. The largest gain in depth per item added. L, kernel and content.
7. **Wind with shape** (§8.3): stronger higher up, calm in the lee of a mountain, and it moves
   falling sand, snow, embers and lake waves. M, kernel. _Shells and thrown earth built 2026-11-20 as
   the match rule `windShape`, see `REQUIREMENTS.md` §3.4; embers, fire and lake waves are not._
8. **Sound in space and music that follows the match** (§7.1, §7.2): pan by position, far blasts
   arrive late and dull, music layers come in as the round tightens. M, client only.
9. **Tanks that show damage and sit on the slope** (§8.4): tilt with the ground, broken tracks,
   bent barrel, fuel leak. M, kernel and renderer. _Built 2026-11-20 as the match rule `tankDamage`:
   damage shows at half and a quarter health, a crippled tank has a broken track and leaks oil, see
   `REQUIREMENTS.md` §3.4. The hull already leaned with the ground in the renderer. Not built: bent
   barrel, aim relative to the hull, sliding on ice, tipping over._
10. **Sim off the main thread** (§9.1). The step that would most help the phone logs: a long
    tick no longer drops a frame. L, client only, no rule change.
11. **Points match with a weapon draft, and co-op against bot waves** (§3.3, §3.4). Two modes
    made for two friends on phones. M each.
12. **Small UI wins** (§6): last-shot ghost in matches, your-turn buzz and sound, rule presets,
    favourites in the weapon list, first-match tutorial. S each.

Suggested first batch, all small or independent of each other: 2, 4, 8 and 12 in parallel, with 1
as the first kernel change.

## 3. Gameplay and modes

1. **Volley mode.** Everyone aims during the same timer, then all shells fly together. Seen in
   ShellShock Live; an open question in `REQUIREMENTS.md` §12. Lockstep suits it: the host
   collects one input per seat and releases them on one tick. Needs: kernel turn structure, HUD
   that shows who is ready, bots that plan without knowing the others' shots, kill credit when
   two shells land together. With 8 seats a turn would also be the liveliest thing the engine
   draws, so cap shells in flight on Low quality. _L, kernel + protocol. Phone: heavy on the
   impact frames._
2. **Turn order by delay.** Each shot adds delay by weapon weight, and each second of thinking
   adds a little; the lowest total goes next (GunBound). A nuke then costs tempo as well as
   cash, and Baby Missile gets a use: two quick shots for one slow one. Needs a turn-order strip
   in the HUD (§6.3). _M, kernel + protocol. Phone: free._
3. **Points match with a draft.** No deaths. Both players pick in turn from one random pool of 20
   weapons, then fire 10 shots each; most damage wins (Pocket Tanks). Tanks that reach zero
   respawn with a points penalty. The draft screen is the fun part and reuses the shop cards and
   previews. _M, content mode + client. Phone: free._
4. **Co-op against waves.** Two or more humans on one team against bot waves that get harder,
   with a shop between waves. The solo ladder already puts all foes on one team; this is that
   online. _M, mostly content. Phone: free._
5. **Squads.** Each player runs two or three small tanks and the turn rotates through them
   (Worms). Nobody is knocked out early, and position matters more. Kernel already handles N
   tanks; needs ownership per seat, HUD chips grouped by player, bots that choose which tank to
   use. _M to L, kernel + protocol._
6. **One against all, and Hold the hill.** A juggernaut seat with triple health and a free heavy
   shell each turn against the rest; or a marked hill where standing on it at turn end scores.
   Both are modes on top of what exists. _S to M each, content._
7. **Wall rules.** Bounce, wrap round, or open sides, per match or as a round twist ("Rubber
   walls"). The kernel already has them per mode (`mode.walls`: wrap, bounce, absorb, concrete);
   what is missing is a setup choice and a twist. Bots aim through the sim's own integrator, so
   bank shots off a wall come cheaply for Trickshot. _S, client + a rule override._
8. **Retreat time.** After firing you may drive on your leftover fuel for three seconds (Worms).
   Makes close shots less of a suicide and gives fuel a second use. _S, kernel._
9. **Reactive map objects.** See top pick 2. Working list: fuel tank (spills oil, burns), water
   tower (floods when holed), power pylon with lines (live steel, shocks what it falls on),
   powder store (uses `material.gunpowder`), dam across a valley, grain silo (pours sand), gas
   main under the City. Generators place them like other props. Worms' barrels and mines are the
   model; ours pour real material. _S each, content. Phone: light, bounded by the prop._
10. **Ghost turns.** A dead player in a 3+ player match gets a small say each turn: nudge the
    wind one step, or call one hailstone. Keeps them watching. _S to M, kernel + protocol._
11. **Same battlefield.** A rule that keeps the map between rounds, craters, lakes and wrecks
    included, instead of a fresh one. The world then has a history. _S, kernel option._
12. **Profile, medals and a daily shot.** Local profile with lifetime stats, medals that grow out
    of the match awards, and cosmetic unlocks only (paint, flag, death effect). A daily challenge
    seeded from the date: same map and kit for everyone, score shared as text. No server needed.
    ShellShock's ranks and Rocket Bot's daily rules are the models. _M, client only._
13. **Handicaps.** Per seat: health and cash percent, and an aim helper that shows the first
    third of the arc. For playing with a friend who is new. _S, kernel option + client._
14. **Interest and selling back.** Interest on unspent cash is in the spec (§3.5) and the 1991
    game. Add sell-back at half price. _S, kernel._

## 4. Weapons and gear

The arsenal is already wide (about 150 ids). The gaps are in _kinds_ of weapon, not in count.

1. **Weapon mods.** Shop items that attach to the next shell you fire: Split (three shells in a
   fan), Bouncy, Timed fuse, Heavy (ignores wind, digs deeper), Carrier (releases your _next_
   weapon where it lands). Noita's wands and ShellShock's upgrades show how a few parts multiply
   an arsenal. Fits `use`/`extends`: a mod is a flight or trigger override applied at fire time.
   Start with three mods and a whitelist of plain shells; bots ignore mods at first. _L, kernel +
   content + protocol._
2. **Weapon settings.** A third pill on some shells: fuse seconds on a bouncing charge, burst
   height on Airburst, spread on scatter shells (Worms' fuse and bounce keys). _M, kernel +
   protocol (one more input field)._
3. **Steered shell.** A slow drone you steer left and right while it flies, the step after
   DROP!. Inputs already flow through lockstep during a shot. _M, kernel + protocol._
4. **Walkers.** A clockwork crawler that walks the ground, hops small gaps, turns at walls and
   goes off on DROP! or on touching a tank (Worms' animal weapons, with a creature of our own).
   _M, content with a new flight behaviour._
5. **Close-range tools.** Dozer blade (push a heap of dirt, or a tank, off a ledge), a mine laid
   while driving, a flat direct-fire gun with two weak shots a turn. Today nearly everything is
   a lobbed shell. _S to M each, content._
6. **Marked strikes.** A beacon shell that sticks where it lands; the next shell homes on it, or
   an air strike runs along the column it marks. Rewards planning two turns. Spotter Flare is the
   starting point. _S to M, content._
7. **Pump.** Sucks up the nearest liquid (water, oil, lava, acid) and your next shot sprays it.
   Whatever the map holds becomes ammunition. _M, content._
8. **Powder trail.** Lays a line of `material.gunpowder` along the ground the way it rolls; any
   spark later runs along it. _S, content._
9. **Growers.** A seed that grows a thorn hedge or bamboo wall over two turns; creeping moss
   that spreads over wet ground and slows tanks; both burn. Living material, in line with the
   chemistry track. _M, content + one ambient process._
10. **Thermite and rust.** A slow burn that eats down through steel and rock; a spray that turns
    steel to weak rust. Counters to bunkers and girders. _S each, content._
11. **Defensive gear.** Deflector (bends one shell upward), point-defence gun (shoots down one
    incoming shell per round), anchor (not thrown or carried by flows), hull seal (no drowning),
    smoke screen (real smoke that hides you from bots' aim and from arc helpers), mirror plate
    (turns a laser). The 1991 game had several shield kinds; we have two. _S each, content._
12. **Girder kit.** Place a steel beam at an angle of your choice: bridge, roof or ramp (Worms).
    Steel already conducts, so it has a risk built in. _S to M, content + a placement UI._
13. **Balance bench.** A node script that plays a few thousand bot rounds and prints pick rate,
    damage per coin and win rate per weapon, then a "tier" line in the field manual. With 150
    weapons this finds the dead ones. _S, tooling only._

## 5. Game logic and bots

1. **Bots that think in terrain.** Bots score a shot by expected damage. Let Hard and Ace also
   try a few candidates in a short forward run of the sim on a copy of the world and score what
   happened: buried, drowned, shocked in water, knocked off a ledge, tree dropped on a tank. This
   is the open question in the spec (§12). Plan during other players' turns so the cost never
   lands on a frame, and warm it up like `sim-warmup.ts`. _L, content AI. Phone: heavy unless
   spread over idle time._
2. **Grudges and pacts.** Bots remember who hit them, gang up on the leader, avoid the bot that
   spared them, and say so in their bubbles. _S, content AI._
3. **Shop characters.** Each personality also has a taste (fire, digging, storms, chemistry), so
   matches against the same bots differ. _S, content AI._
4. **Adaptive skill for solo play.** An "Auto" difficulty that moves a step after each round by
   how close it was. _S, client + content._
5. **Bots that dig out and take cover.** With top pick 1 in, bots should park behind cover, and
   free themselves when buried instead of firing into the dirt. _M, content AI._
6. **Rule presets.** The setup screen has about fifteen switches. Add named presets (Classic,
   Chaos, Sniper duel, Mud bath, Quick phone match) and a share code or link for a custom set
   (Worms' schemes). _S, client._
7. **Turn pressure.** In the last five seconds of the timer the aim wobbles slightly, or the
   shell fires at reduced power on time-out. Makes the timer a rule, not a formality. _S._

## 6. UI and UX

1. **Instant replay.** Spec §8 asks for a replay of the last shot. Keep the world snapshot from
   the start of each shot, re-run it on a second sim in the client, and add a Replay button plus
   an automatic "shot of the match" on the match-over card (the awards already know which shot).
   Then a Share button that records the canvas to a short video. Forts does exactly this. _M,
   client only. Phone: the replay costs what the shot cost._
2. **Last-shot ghost in matches.** The faint arc and landing mark of your previous shot, and a
   tick on the angle and power pills at the last values. Training has the arcs; matches do not.
   A host switch, since it is an aid. ShellShock's tracer option. _S, client._
3. **Turn strip.** One row that shows who is next and what the world will do: crate in two
   turns, volcano rumbling, tide rising, storm cloud with two turns left. Today these are toasts
   that pass. _S to M, client; animate with transform only._
4. **Action camera, optional.** A setting that eases the view to the impact when it lands off
   screen and back again. The spec chose no auto-follow; zoomed out on a phone, hits are small.
   Camera only, never through React state. _S to M, client._
5. **Your-turn signals.** Vibrate (Android Chrome), a sound, a title flash and an optional
   system notification when your turn starts online. Also short buzzes on fire and on being hit.
   _S, client. iOS has no vibration API._
6. **Weapon list for 150 weapons.** Favourites, recently used, a swap-to-previous button, and a
   long-press card with the description (asked for in the spec, flagged in the polish audit).
   _S, client._
7. **First match tutorial.** A one-minute guided match: aim, wind, fire, drive, shop. Training
   exists but nothing leads a new player there. _S to M, client._
8. **Emotes online.** Six quick reactions that show as a speech bubble over your tank, drawn by
   the bots' bubble renderer. _S, client + protocol._
9. **Stats after the match.** Damage per round as a small chart, shots and hit rate, a shot
   list you can tap to replay (with 6.1). _S to M, client._
10. **Mini-map when zoomed in.** A skyline line with tank dots in a corner. One line strip, not
    a second render of the map. _S, client. Phone: light._
11. **Shop shortcuts.** "Same as last round", a budget auto-buy, and starter bundles. _S._
12. **Controller and key rebinding.** Gamepad support and the rebinding the spec lists. _S to M._
13. **Flash and motion setting.** A "Reduce flashes" switch that caps full-screen whiteouts and
    strobing (nukes, lightning), next to the shake switch. Part of meeting WCAG 2.2 (2.3.1).
    Colour-blind patterns on tanks are in the spec as well. _S, client._

## 7. Audio

All chiptune, synthesised or tracker (§8b).

1. **Sound in space.** Pan every effect by where it is on screen. A far blast arrives late (the
   flash first, the bang after, by distance), duller and quieter; a blast in a cave rings; under
   water it is muffled. Zoomed far out, everything is a little further away. None of this is in
   `client/src/audio` today. _S to M, client only. Phone: light._
2. **Music that follows the match.** Two tunes exist. Write the battle tune in layers and switch
   tracker channels on as tension rises (two tanks left, low health, sudden death), with short
   stingers for a kill, a round win and your turn. Add a tune per theme and a night variant.
   Layering and stingers are the standard tools of adaptive music. _M, content + client._
3. **Impact by material.** The same shell thuds in sand, cracks on rock, clangs on steel, whumps
   in water, shatters on ice: pick synth parameters from the material under the blast.
   Continues Noita gap item 11. _S to M, client._
4. **Incoming whistle.** Shell pitch follows its speed and falls as it comes down; louder for
   the tank it is heading for. _S, client._
5. **Bot voices.** Each personality's bubble types out with its own chip babble. _S, client._
6. **The world's own sounds.** Crickets at night, a dawn chorus, wind that howls with the wind
   bar, distant thunder before a storm front, ice creaking on Glacier. _S each, content._
7. **Mix.** Duck the music under big blasts, a limiter on the master, and the missing UI sounds
   listed in the polish audit §6.1. _S, client._

## 8. Physics

1. **Cover counts.** Blast damage is cut by the solid cells between the blast and the tank: a
   coarse ray, or a flood through air out to the blast radius. The flood also gives **confined
   blasts**: in a tunnel or cave the pressure has nowhere to go and reaches further along it,
   while in the open it is weaker. Bunker Buster and Tunnel Rat become what their names say.
   Bots must learn it (§5.5). Runs once per blast inside its radius. _M, kernel. Phone: light._
2. **Shells and materials.** By the material hit and the angle: ricochet off rock, steel and ice
   on a flat hit; skip on water when fast and flat; bury a few cells into mud, snow and sand
   before going off (deeper, narrower crater, muffled blast); burst on the surface of rock
   (wide, shallow, more shrapnel). Per-material numbers live in the material manifests. _M,
   kernel + content._
3. **Wind with shape.** Wind grows with height (flat shots are safer, lobs drift more), and the
   lee side of a tall ridge is calm, computed once per turn from the skyline. Wind also pushes
   falling sand, snow and ash sideways, carries embers downwind to start spot fires, drives fire
   faster uphill and downwind, and raises small waves on lakes. Bots predict through the sim, so
   they follow. _M, kernel. Phone: light (a 1D table)._
4. **Tanks with weight.** The hull tilts to the ground under its tracks, so the gun's angle is
   relative to the hull (a host option, as it makes aiming harder). Tanks slide on ice and steep
   wet mud and tip over past a limit. Damage shows and matters: broken track (half drive), bent
   barrel (narrower angle), fuel leak (an oil trail that can be lit). _M, kernel + renderer._
5. **Heat on a coarse grid.** A temperature byte per 4×4 cells that spreads slowly: lava and
   fire melt snow and ice at a distance, boil shallow water, bake mud to clay; rock glows and
   cools to dark. Continues Noita gap item 15, made affordable by the coarse grid and by only
   updating near sources. _L, kernel. Phone: heavy without the bounds._
6. **Water that moves earth.** Running water picks up loose dirt and sand and drops it where it
   slows: gullies after rain, a fan at the foot of a slope, a muddy lake. Wet sand stands
   steeper than dry, and soaked ground slumps. _M, kernel. Phone: only in cells with fast water._
7. **Things that float.** Logs, planks and ice slabs float and drift with the flow, rock sinks,
   and a tank on a log raft rides it. Crates float already. _M, kernel._
8. **Cables.** A deterministic integer rope (fixed-point Verlet): power lines between pylons that
   sag, conduct and whip when cut; rope bridges; a hanging crate; a wrecking ball on a crane; and
   a winch as gear that pulls a tank up a cliff (the tank answer to Worms' rope). One system,
   many toys. _M to L, kernel + content._
9. **Fire that behaves.** Smoke fills caves and chokes a tank that sits in it; a fire with no air
   above it dies; ash left behind lets grass return sooner (§9.6). _S to M, kernel + content._
10. **Blast through water.** Under water the fireball is small but the shock runs far through
    the lake and hurts everything in it. Fish already float up. _S, kernel._

## 9. Visuals and performance

1. **Sim in a worker.** Run the kernel in a Web Worker and send the renderer its snapshot and
   dirty rectangles. A 40 ms tick then costs the picture nothing, and the phone logs show long
   ticks as the main remaining stutter. Lockstep is unchanged. Shared memory needs headers that
   GitHub Pages does not send, so start with transferred buffers. _L, client. No rule change._
   **Built** (ARCHITECTURE §5.2): local and online matches; challenges, training and the
   sandbox still run on the page.
2. **Sun and shadow.** The time of day already moves across rounds. Cast a hard, dithered shadow
   from the skyline by the sun's angle (a 1D skyline texture and a short march in the terrain
   shader), long at dawn and dusk. Big blasts light the ground for a moment in hard bands.
   _M, renderer. Phone: light._
3. **Tracks and wet ground.** Tread marks pressed into mud, snow and sand that fade; ground
   darkened by rain that dries; puddles that catch the sky. _S to M, renderer + a small layer._
4. **Water surface.** A dithered mirror of sky and blasts on still lakes, foam where water meets
   shore, ripples under rain. _S to M, renderer._
5. **Deaths by cause.** Drowned (bubbles, then a hatch pops), frozen and shattered, melted,
   shocked, buried (a periscope comes up). The 1991 game varied its death blasts; ours can follow
   the chemistry. _S to M, content + renderer._
6. **Regrowth.** Over turns, grass creeps back over bare dirt and scorched ground, faster on ash
   and wet soil, and not on poisoned ground. With "Same battlefield" (§3.11) old craters turn
   green. _S to M, an ambient process._
7. **More places and weather.** Dunes with a sandstorm that piles sand downwind; a jungle with
   vines and hard rain; a moon with low gravity, no wind and muffled sound; fog that hides far
   tanks. Aurora on Glacier, city lights at night, far lightning before a front. _M each._
8. **Heat shimmer and shock ripple.** Whole pixel rows offset over lava and fire and in the ring
   of a big blast, done in the post pass so it stays on the pixel grid. _S, renderer._
9. **Match poster.** At match end, a picture of the final battlefield with the scores and awards
   on it, to save or share. _S, client._

## 10. Looked at and not proposed

- **Real-time play** (Liero, Rocket Bot Royale): a different game, and lockstep with shared input
  delay does not suit it.
- **Paid upgrades, ads, energy timers** (Tank Stars): against the free, no-server stance.
- **Weapons that level up with use** (ShellShock Live): needs accounts to be fair online; local
  cosmetic unlocks (§3.12) give the same pull without it.
- **Accounts, ranked ladders, matchmaking**: need a real backend; the free signalling server
  cannot carry it.
- **Voxel or 3D views**: scrapped earlier.

## Sources

- Worms: [GamesRadar on the series](https://www.gamesradar.com/annelid-antics-how-worms-made-an-art-of-refining-a-timeless-genre),
  [Giant Bomb, Worms Armageddon](https://www.giantbomb.com/games/3030-17255/),
  [Worms Knowledge Base, Sudden Death](https://worms2d.info/Sudden_Death),
  [Worms Wiki, Round Time](https://worms.fandom.com/wiki/Round_Time),
  [Wikipedia, Worms W.M.D](https://wikipedia.com/wiki/Worms_W.M.D),
  [GameSpot review of W.M.D](https://gamespot.com/reviews/worms-wmd-review/1900-6416517/)
- ShellShock Live: [Steam page](https://store.steampowered.com/app/326460/ShellShock_Live/),
  [Wikipedia](https://en.wikipedia.org/wiki/ShellShock_Live)
- GunBound: [Wikipedia](https://en.wikipedia.org/wiki/Gunbound),
  [DragonBound mobile guide](https://dragonbound.net/guide/mobiles)
- Pocket Tanks: [Giant Bomb](https://giantbomb.com/wiki/Games/Pocket_Tanks),
  [Wikipedia](https://www.wikipedia.org/wiki/Pocket_Tanks)
- Scorched Earth: [Wikipedia](<https://en.wikipedia.com/wiki/Scorched_Earth_(video_game)>),
  [MobyGames](https://www.mobygames.com/game/402)
- Tank Stars: [CrazyGames listing](https://www.crazygames.com/game/tank-stars-online),
  [GameSkinny guide](https://www.gameskinny.com/?p=59248)
- Liero: [Wikipedia](https://en.wikipedia.org/wiki/Liero),
  [TL.net essay "On weaponized earthworms"](https://tl.net/blogs/375918-on-weaponized-earthworms)
- Noita: [Wand mechanics guide](https://noita.wiki.gg/wiki/Guide:_Wand_Mechanics),
  [GDC talk "Exploring the Tech and Design of Noita"](https://gdcvault.com/play/1025695/Exploring-the-Tech-and-Design),
  [80.lv on its rigid bodies](https://80.lv/articles/noita-a-game-based-on-falling-sand-simulation/)
- Forts: [Steam page](https://store.steampowered.com/app/410900/Forts/),
  [MobyGames](https://www.mobygames.com/game/87156)
- Rocket Bot Royale: [Steam page](https://store.steampowered.com/app/1748390/),
  [itch.io page](https://winterpixel.itch.io/rbr)
- Game feel: ["Juice that matters"](https://molbv.github.io/blog/2025-06-24-juice-polish.html),
  [Game Developer, "6 mistakes that'll drain the juice out of your game"](https://gamedeveloper.com/design/6-mistakes-that-ll-drain-the-juice-out-of-your-game)
- Adaptive music: [Wikipedia](https://en.wikipedia.org/wiki/Adaptive_music),
  [Audiokinetic, "How to Use Interactive Music to Score Gameplay"](https://www.audiokinetic.com/en/blog/how-to-use-interactive-music-to-score-gameplay/),
  [Game Developer, "Pure vertical layering"](https://www.gamedeveloper.com/blogs/pure-vertical-layering-for-game-music-composers-from-spyder-to-sackboy-gdc-2021-)
