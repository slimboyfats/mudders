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
    date: '2026-11-10',
    title: 'Living chemistry and glow in the dark',
    pack: 'core@0.61.0 – 0.69.0',
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
      'Shells that hit water throw it up in a crown of real drops that rain back down, run off the banks and pour into craters',
      'Blast pressure blows the leaves off trees well beyond the crater: trunk and branches stay standing while the leaves flutter away on the wind. Shockwaves reach furthest, and a hill shelters the trees behind it',
      'Trees come alive in the wind: trunks lean downwind, crowns rock as gusts roll across the map and leaves flicker, harder the stronger it blows',
      'Six new kinds of tree: pine, birch, poplar, willow, autumn maple and bush. The Village gets a mixed wood, Lakeland willows by the water, the Glacier pines',
      'Trees snap and fall: a hard hit breaks a tree at the trunk, and it tips over in one piece away from the blast, faster as it goes, crashing down as a log beside its stump in a burst of dust. A direct hit still blows it to splinters',
      "Swallows: little flocks wheel over every map and ride the wind. A shell that flies into one goes off right there in the sky, shots make them scatter, and a blast's pressure front bursts any it reaches into black pixels",
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
