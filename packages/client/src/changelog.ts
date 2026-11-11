/**
 * What shipped, newest first: the start screen's Changelog panel and the field manual's "What's
 * new" section both read this list. Add a new entry on top when a wave of PRs merges.
 *
 * `newSince` marks which weapons get a NEW badge in the shop and the weapon picker: every weapon
 * whose manifest `meta.since` is at or after it. Set it on the newest entry; older entries keep it
 * only as a record.
 */
export interface ChangelogEntry {
  /** ISO date the changes merged. */
  date: string;
  title: string;
  /** Content pack range shipped that day, e.g. "core@0.40.0 – 0.60.0". */
  pack?: string;
  newSince?: string;
  items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: '2026-11-11',
    title:
      'Real damage for less money, weapons that really hurt, supply drops and big money matches',
    pack: 'core@0.72.0 – 0.74.0',
    newSince: 'core@0.73.0',
    items: [
      'New weapon: Frag Shell, a sharp bang that bursts into white-hot shrapnel, so a near miss still hurts',
      'New weapon: Hornet Swarm, pops at the top of its arc into five darts that each hunt the nearest enemy',
      'New weapon: Concussion Shell, a small crater but a wide pressure blast that hits tanks twenty or thirty cells away',
      'New weapon: Tandem Charge, a first charge knocks shields flat and cracks the ground, the main charge goes off in the hole',
      'New weapon: Buzzsaw, lands and saws along the ground the way it was fired, cutting through small hills, and bites into the tank it meets',
      'Harder hitting for their price: Smart Bomb, Laser, Roller, Heat Seeker (now cheaper too), Lightning, Drill Torpedo, Railgun and Heavy Laser all do clearly more than a plain Missile now',
      'Supply drops: every few turns a wooden crate parachutes in somewhere away from the tank whose turn it is, with a weapon, gear, health, fuel or cash inside. Its badge shows which kind',
      'Any tank that touches a crate takes it: drive to it, fall onto it, or use Teleport Shell, Swap Ray or Portal Pair to get there first',
      'Crates are real objects: they swing under the canopy and drift with the wind, tip over edges and tumble down slopes, float on water and burn in fire',
      'Blasts throw crates about and a close one smashes them to splinters; a shell through the canopy drops the crate like a stone, so you can deny one to your enemy',
      'Bots drive to a crate when one lies within reach',
      'New Rules option: Supply drops Off, Rare, Normal or Often (Normal by default, works online too)',
      'Rules: start with up to 100,000 cash',
      'Rules: new "Cash per round" picker gives every player +5,000 to +50,000 after each round, on top of what they won',
      'Shockwaves throw tanks much farther and higher, hurl more dirt and blow trees and buildings apart harder. A tank thrown into a hillside takes a slam hit, harder the faster it flew',
      'Falls hurt twice as much: a tank that drops or is thrown without a parachute takes 2 damage per cell it falls past the first four. Parachutes still land you unhurt',
      'Napalm and fire keep burning: a tank sitting in burning jelly or flames takes damage the whole time it burns, not just once at the end of the turn. Napalm now does about 60 on a direct hit instead of 15, Hot Napalm about 80',
      'Acid Cloud eats 12 health a turn (was 4), Toxic Gas 16 (was 8) and Plague 14 (was 7)',
    ],
  },
  {
    date: '2026-11-10',
    title: 'Living chemistry and glow in the dark',
    pack: 'core@0.61.0 – 0.71.0',
    newSince: 'core@0.62.0',
    items: [
      'Real gas in the world: steam, flames, marsh gas and gas flares rise, drift with the wind and bubble up through water',
      'Burning ground throws flames up that light anything that burns; water on fire or lava boils off as steam',
      'Burst gas pockets leave marsh gas hanging over the hole, and any flame sets the cloud off in a chain of flares',
      'New weapon: Bog Flask, a cloud of marsh gas waiting for a spark',
      'Materials now react by kind (anything hot, anything that burns), so new materials join in by themselves',
      'Falling sand, dirt and liquids keep their own grain colour as they tumble and pour',
      'Glowing things light the ground and air in their own colour: plasma violet, crystal lilac, reactor cores green, lava and fire orange',
      'New Pitch Black theme in Settings: no light but what burns, glows or explodes. Try it on the Caves map',
      'Water stays now: it pours, spreads and levels out into lakes instead of soaking away, and turns dirt to mud',
      'New map: Lakeland, rolling hills with lakes in the hollows. Boil them with lava or drain them with a crater',
      'Shells that hit water throw it up in a tall crown of real drops that rain back down, run off the banks and pour into craters, and send waves rolling out across the lake',
      'Blast pressure blows the leaves off trees well beyond the crater: trunk and branches stay standing while the leaves flutter away on the wind. Shockwaves reach furthest, and a hill shelters the trees behind it',
      'Trees come alive in the wind: trunks lean downwind, crowns rock as gusts roll across the map and leaves flicker, harder the stronger it blows',
      'Six new kinds of tree: pine, birch, poplar, willow, autumn maple and bush. The Village gets a mixed wood, Lakeland willows by the water, the Glacier pines',
      'Trees snap and fall: a hard hit breaks a tree at the trunk, and it tips over in one piece away from the blast, faster as it goes, crashing down as a log beside its stump in a burst of dust. A direct hit still blows it to splinters',
      'Blasts set trees on fire: the heat of an explosion lights the crowns nearest to it, pine needles and dry autumn leaves most readily, and the fire eats down the tree. Fire blasts light them twice as readily',
      "Swallows: little flocks wheel over every map and ride the wind. A shell that flies into one goes off right there in the sky, shots make them scatter, and a blast's pressure front bursts any it reaches into black pixels",
      'Explosions are no longer a disc: a white-hot fireball of single pixels bursts out, then the air rolls it up into a head that curls over and a swirl of fire sweeping out along the ground each side, bigger on the side the shell was heading. Smoke, sparks, embers, dust and leaves are carried round by the same air',
      'Gas clouds are made of single pixels: toxic gas bursts out, billows, then sinks and pours downhill cell by cell instead of sliding along as one solid blob',
      'Blasts throw real dirt: the ground dug out of a crater sprays from its edge as single grains in the colour of that ground, most landing close and a few flying far, more of it the way the shell was heading',
      'The edge walls are alive: the whole wall churns like a dark liquid with its face rolling in waves, and a shell flying into it is swallowed instead of going off. It splashes, throws a jet back out, sends rings across the whole wall and sinks in, cooling as it goes. The sudden-death wall swallows shells where it stands too',
      'Fire lights its surroundings: while a fireball burns, the smoke and flying dirt around it glow warm and the crater edge stays lit, dimming in steps as the fire dies',
      'Craters slump: a blast shakes the ground around and above its crater loose, and it slides down into an open bowl instead of standing as a sheer cut. Sliding sand drags dirt along and mixes with it, the turf travels with the ground it grew on, and tunnels, laser cuts and dirt pillars keep their walls',
      'Blast smoke clears sooner, thinning out pixel by pixel',
    ],
  },
  {
    date: '2026-11-09',
    title: 'The big weapon wave',
    pack: 'core@0.40.0 – 0.60.0',
    newSince: 'core@0.44.0',
    items: [
      '25 new weapons: Kaiju, Plasma Orb, Teleport Shell, V3 Rocket, Railgun, Swap Ray, Portal Pair, Chain Reactor, Shield Breaker EMP, Plasma Cannon, Gravity Well, Supernova, Rogue Black Hole, Fuel-Air Bomb, Telepathy, Daisy Cutter, Spotter Flare, Earth Bridge, Bunker Buster, Repair Drone, Decoy Tank, Caltrop Field, Tripwire Net and Acid Cloud',
      'Kaiju: summon a monster out of the ground that grabs and throws tanks and catches shells',
      'Shockwaves now throw tanks and blow buildings apart, with a wobbling plasma ring',
      'Rules: pick the turn sudden death starts from (off, 3, 5, 8 or 10)',
      'Weapon damage balanced to blast size and price',
      'Houses and trees tear or tip when undermined; rock and ice overhangs break by span',
      'Liquid surface with waves on water, lava and tar; smoke flows through the fluid everywhere',
      'Field manual: player docs for every weapon, object, material, tank and gear',
      'Online: rejoin a match after a long absence',
    ],
  },
  {
    date: '2026-11-08',
    title: 'Storms, particles and the death wall',
    pack: 'core@0.37.0 – 0.39.0',
    items: [
      'New weapons: Ion Cannon, Thunderstorm and Superstorm',
      'GPU particle engine: single-pixel particles, swirl and stepped colour fades',
      'GPU smoke and gas that flow around the terrain',
      'Alive pass: rain, snow, lightning, boiling clouds, gusting fire and blast sparks',
      'A creeping wall of darkness past the map edges, and a burning sudden-death zone',
      'A 50,000 starting cash option',
    ],
  },
  {
    date: '2026-11-07',
    title: 'Effects and a touch-first UI',
    items: [
      'New HUD: drag the angle and power pills, pop-up weapon picker, menu sheet',
      'Shop redesign, new title screen and menus; landscape phone layouts',
      'Full screen on phones, smooth pinch zoom and a free touch camera',
      'Nuke sky flash, debris chunks, heat haze, smoke columns and dynamic lighting',
      'Tank death sequence, screen shake, hit-stop and a slow-mo finisher',
      'Coloured shell trails, water splashes and ripples',
      'Temperature that affects fuel and fire, with snow and sand storms',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Big weapons, maps and driving',
    pack: 'core@0.12.0 – 0.34.0',
    items: [
      'Spectacular nukes, MIRV, Napalm, Lightning, Heavy Shockwave, Singularity and Magma Bomb',
      'New weapons: Fault Line, Toxic Gas, Mud Geyser, Frost Bomb, Ricochet Ball, Dirt Bomb, Tornado, Orbital Lance, Dirt Tsunami, Sinkhole, Magnet Mine, Black Hole Mine, Bumper, Drill Torpedo, Cluster Fireworks, Volcano Seed, Glue Bomb and Ice Wall',
      'Six tank types, driving with fuel, shields, parachutes and batteries',
      'Maps: Marsh, City, Floating islands, Caves, Glacier and Clay pits',
      'Materials: mud, ice, clay, crystal, gas pockets, tar, moss, gunpowder seams and magma',
      'Rain, snow and gusty wind',
      'Up to 8 players, team play and longer matches',
      'Hosted on GitHub Pages, with online play through the lobby server',
    ],
  },
  {
    date: '2026-11-05',
    title: 'First playable',
    items: [
      'Fully destructible terrain on a deterministic simulation',
      'Hot-seat matches with a shop, scoring, sudden death and AI players',
      'Online play over WebRTC with a relay fallback, public games and AI takeover',
      '53 weapons, effects, themes and chiptune audio',
      'Installable app that works offline',
    ],
  },
];

const parse = (since: string): number[] =>
  (since.split('@')[1] ?? since).split('.').map((n) => Number(n) || 0);

/** Orders two `pack@x.y.z` versions; negative when `a` is older. */
export function compareSince(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The version weapons must be at or after to count as new: the newest entry's `newSince`. */
export const NEW_SINCE: string | undefined = CHANGELOG.find((e) => e.newSince)?.newSince;

export function isNew(since: string | undefined): boolean {
  return since !== undefined && NEW_SINCE !== undefined && compareSince(since, NEW_SINCE) >= 0;
}

const SEEN_KEY = 'mudders.changelogSeen';

/** True until the player opens the changelog after a new entry lands (per device). */
export function hasUnseen(): boolean {
  const latest = CHANGELOG[0]?.date;
  if (!latest) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== latest;
  } catch {
    return false;
  }
}

export function markSeen(): void {
  const latest = CHANGELOG[0]?.date;
  if (!latest) return;
  try {
    localStorage.setItem(SEEN_KEY, latest);
  } catch {
    // storage blocked: the dot just stays
  }
}
