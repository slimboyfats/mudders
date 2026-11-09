import type { EffectEvent } from '@mudders/shared';
import type { Quality } from '../types';
import { Shape, type QuadBatch } from './batch';
import { drawPost, makePost, type Post } from './bumper';
import { drawKaiju, kaijuEmerged, KAIJU_STATES, toppleAngle, type KaijuFx } from './kaiju';
import { Chunks } from './chunks';
import { FxRng } from './gl';
import { blastShake, SHAKE_MIN, shakeTicks } from '../impact';
import { IonStrikes } from './ion';
import { Lances } from './lance';
import type { Lights } from './lighting';
import { drawStar, drawWell, type GravityFx, type StarFx } from './gravity';
import { drawMagnet, type MagnetFx } from './magnet';
import { drawPortal, RING_A, RING_B, type PortalFx } from './portal';
import { drawMushroom, emitMushroom, makeMushroom, type Mushroom } from './mushroom';
import { PKind, type Emit, type ParticleSink } from './particles';
import { shade } from './theme';
import type { FluidSink } from './fluid';
import { drawFunnel, funnelWidth, makeFunnel, type Funnel } from './tornado';

/** Hard shade bands for cosmetic dirt clods. */
const DIRT_BANDS = [0.62, 0.8, 1, 1.18, 1.32] as const;

/**
 * Pixel-renderer implementations of renderer-agnostic effect events (§2b, §2c.3 `effect.*`).
 * Each event type maps to a handler; unknown types are ignored. Everything is seeded from the
 * event itself, so the same snapshot stream always produces the same frames.
 */

export interface Ripple {
  x: number;
  y: number;
  start: number;
  dur: number;
  maxR: number;
  width: number;
  strength: number;
  /** A vertical column wave from the sky down to (x, y), wobbling sideways (Ion Cannon charge). */
  column?: boolean;
}

interface Glow {
  x: number;
  y: number;
  r: number;
  start: number;
  dur: number;
  color: number;
  strength: number;
}

interface Front {
  x: number;
  y: number;
  maxR: number;
  start: number;
  dur: number;
  rng: FxRng;
  /** A frost front: ice glints and cold mist instead of dust and grit. */
  cold?: boolean;
  /** A shockwave's ring of force: a shimmering violet-to-cyan portal ring in the air as well. */
  portal?: boolean;
}

/** Shockwave plasma tones: electric blues and violets (each mote ramps hot → this → deep violet). */
const PORTAL = [0x3a5cff, 0x4a8cff, 0x6a4cff, 0x9a5cff, 0x40b8ff] as const;
/** How far past its own duration (as a fraction of it) a shockwave's plasma ring keeps going. */
const PORTAL_COAST = 1.8;

/**
 * A singularity's hang: grit and light spiralling into a growing black core. `snap` is a Black
 * Hole Mine's end instead: a wide black disc with a hard violet rim that slams shut to a point.
 */
interface Vortex {
  x: number;
  y: number;
  r: number;
  start: number;
  dur: number;
  rng: FxRng;
  snap?: boolean;
}

interface Crystal {
  /** Cells of the spikes, x0,y0,x1,y1,… */
  cells: Int32Array;
  x: number;
  y: number;
  /** Longest spike, in cells. */
  len: number;
  start: number;
  dur: number;
}

/** A firework burst in the sky: its two star colours, and a crackle due a moment after. */
interface Firework {
  x: number;
  y: number;
  start: number;
  /** Main star colour and the inner ring's colour. */
  main: number;
  inner: number;
  rng: FxRng;
}

/** Firework star colours: hard chip primaries, no blends. */
const FIREWORK = [0xff4040, 0x40ff70, 0x5a8cff, 0xffd040, 0xff5ae6, 0x40f0ff, 0xffa030] as const;
/** Ticks after a burst until its stars crackle, and how long a burst's colour stays claimable. */
const FIREWORK_CRACKLE = 26;
const FIREWORK_KEEP = 400;

/** Ice colours, light to deep, for shards, glints and the frost front. */
const ICE = [0xffffff, 0xe6f6ff, 0xbfe4fa, 0x8ccbef, 0x5ea8dc] as const;

/** A mud geyser's erupting column, fed with particles every tick while it lasts. */
interface Jet {
  x: number;
  y: number;
  /** Peak height of the column in cells. */
  height: number;
  start: number;
  dur: number;
  rng: FxRng;
}

/** Glue tones (Glue Bomb): highlight, lit body, body, shadow. Cream, so it never reads as tar. */
export const GLUE = [0xfffbea, 0xf2e6b4, 0xd8c785, 0xa88f4c] as const;

/**
 * A string of glue: anchored at one end, its head flies out (and sticks where it lands); the
 * string between sags, thins at the middle and snaps when its life runs out.
 */
interface Strand {
  ax: number;
  ay: number;
  hx: number;
  hy: number;
  vx: number;
  vy: number;
  start: number;
  life: number;
  stuck: boolean;
}

/** A dome of glue swelling up where a Glue Bomb burst, wobbling and slumping into a puddle. */
interface Splat {
  x: number;
  y: number;
  r: number;
  start: number;
  dur: number;
}

/** Smoke column soot tones: deep, grey, black (fire). */
const SOOT = [0x3a3436, 0x6a6262, 0x342c2a] as const;

/** Mud tones for geyser columns and splats: deep, body, lit, wet sheen. */
const MUD = [0x4a3f2a, 0x6e6046, 0x8f7f5a, 0xbcae86] as const;
/** Steam puffs over a geyser. */
const STEAM = [0xd0c8b8, 0xb0a898, 0x8c8474] as const;

/**
 * A smoke column left standing over a big impact: soot poured into the smoke fluid from the
 * crater every tick, thinning out over `dur` ticks. The fluid carries it up and downwind, so
 * the column bends with the wind and its top spreads into a flat pall.
 */
interface SmokeColumn {
  x: number;
  y: number;
  /** Blast radius that started it (grows when a blast lands right on top of it). */
  r: number;
  start: number;
  dur: number;
  /** Young puff tone: black soot for fire, grey for plain blasts, tinted dust for kinetic hits. */
  color: number;
  rng: FxRng;
}

/**
 * Old-style smoke puffs (`PKind.Smoke` in a sooty grey) pooled over one tick and poured into the
 * smoke fluid as a few splats, so every effect smokes through the same fluid as the blasts.
 */
interface SmokeBucket {
  n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}
const SMOKE_BUCKETS = 8;

/** A sooty tone: dark and nearly grey. Coloured puffs (steam, frost, gas, dirt) stay particles. */
function sooty(c: number): boolean {
  const r = (c >>> 16) & 255;
  const g = (c >>> 8) & 255;
  const b = c & 255;
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  return hi <= 0x98 && hi - lo <= 0x24;
}

/** Smallest blast radius that leaves a smoke column (a standard missile is 24). */
export const SMOKE_COLUMN_MIN_R = 18;
/** Columns kept at once; the oldest goes first. */
const SMOKE_COLUMN_MAX = 10;
/** Ticks a nuke's sky whiteout holds at full strength before it starts to fade. */
export const WHITEOUT_HOLD = 8;

/**
 * Nuke sky whiteout (day/night flash): the strength of the white sky `age` ticks after the bang.
 * Holds at `peak` for WHITEOUT_HOLD ticks, then eases back to the normal sky over `fade` ticks
 * (slow at first, slow at the end). The shader turns it into hard dithered bands.
 */
export function whiteoutAt(age: number, peak: number, fade: number): number {
  if (age < 0 || peak <= 0) return 0;
  if (age <= WHITEOUT_HOLD) return peak;
  const k = 1 - (age - WHITEOUT_HOLD) / fade;
  if (k <= 0) return 0;
  return peak * k * k * (3 - 2 * k);
}

/** A nuke's whiteout size: bigger blasts light the sky harder and for longer. */
export function whiteoutFor(radius: number): { peak: number; fade: number } {
  return { peak: Math.min(1, 0.45 + radius / 130), fade: Math.round(60 + radius * 3) };
}

interface Bolt {
  /** Cells of the jagged path, x0,y0,x1,y1,… (main channel then branches). */
  cells: Int32Array;
  /** Where the main channel ends in `cells` (branches after are drawn dimmer). */
  main: number;
  start: number;
  dur: number;
  /** Thickness scale (1 = a normal Lightning bolt; Ion Cannon bolts are fatter). */
  w?: number;
  /** Seed for this bolt's flicker and the bits it throws. */
  seed: number;
}

/**
 * Brightness of a bolt per tick of age, in hard steps: the dim stepped leader, the white return
 * stroke, then two restrikes with dark gaps between, each weaker than the last. Past the table
 * the channel gutters out (see `drawBolts`).
 */
const BOLT_FLICK = [0.45, 1, 0.7, 0.95, 0, 0.85, 0.4, 0, 0.9, 0.3, 0.6, 0, 0.5] as const;

/**
 * Flash and sky colours per damage type (index into DAMAGE_TYPES: blast, kinetic, heat, cold,
 * shock, dig, corrosive): [glow colour, sky tint r, g, b].
 */
const DT_LOOK: readonly (readonly [number, number, number, number])[] = [
  [0xffc070, 0.5, 0.32, 0.18],
  [0xffe0b0, 0.42, 0.36, 0.28],
  [0xff8a30, 0.62, 0.24, 0.06],
  [0xa8dcff, 0.2, 0.36, 0.62],
  [0xc8d8ff, 0.42, 0.46, 0.72],
  [0xd0b080, 0.34, 0.27, 0.16],
  [0xb8f040, 0.22, 0.5, 0.1],
];

/** Debris chunks alive at once (cosmetic; the oldest resting one is replaced when full). */
const CHUNK_CAP = 192;
/** Smallest blast radius that throws debris chunks. */
const CHUNK_MIN_RADIUS = 18;
/** Gravity for chunks, in cells/tick² (the renderer's particle gravity). */
const CHUNK_GRAVITY = 0.12;

export const QUALITY_PARTICLES: Record<Quality, { cap: number; mult: number }> = {
  low: { cap: 30000, mult: 0.35 },
  medium: { cap: 100000, mult: 0.7 },
  high: { cap: 300000, mult: 1 },
};

/** Reads terrain for effects (e.g. chunk colour); renderer-provided. */
export interface TerrainProbe {
  material(x: number, y: number): number;
  color(material: number): number;
  /** Whether grass grows on this cell (the round-start surface, not yet burnt or dug). */
  grass?(x: number, y: number): boolean;
  width: number;
  height: number;
}

/** Pull a glow colour halfway to a fire orange, for the light it casts on the ground. */
function warmLight(c: number): number {
  const r = ((c >> 16) & 255) * 0.5 + 255 * 0.5;
  const g = ((c >> 8) & 255) * 0.5 + 150 * 0.5;
  const b = (c & 255) * 0.5 + 60 * 0.5;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export class EffectSystem {
  ripples: Ripple[] = [];
  private glows: Glow[] = [];
  private fronts: Front[] = [];
  private bolts: Bolt[] = [];
  private jets: Jet[] = [];
  /** Frost Bomb starbursts: jagged ice spikes out of the impact. */
  private crystals: Crystal[] = [];
  private mushrooms: Mushroom[] = [];
  private vortices: Vortex[] = [];
  private funnels: Funnel[] = [];
  /** Glue Bomb strings and domes. */
  private strands: Strand[] = [];
  private splats: Splat[] = [];
  private fireworks: Firework[] = [];
  /** Bumper posts (weapon.bumper). */
  private posts: Post[] = [];
  private magnets: MagnetFx[] = [];
  /** Gravity Wells (weapon.gravity-well), one per resident op. */
  private wells: GravityFx[] = [];
  /** Supernova stars while they burn. */
  private novas: StarFx[] = [];
  /** Rogue black holes (weapon.rogue-hole); they move, so they're matched by proximity. */
  private holes: GravityFx[] = [];
  /** Kaiju monsters (weapon.kaiju), one per resident op. */
  private kaijus: KaijuFx[] = [];
  /** Portal Pairs (weapon.portal-pair), one per resident op. */
  private portals: PortalFx[] = [];
  /** Lingering smoke columns over big impacts. */
  readonly columns: SmokeColumn[] = [];
  /** The shake playing now: peak amplitude in cells, start and length in presentation ticks. */
  private shakeAmp = 0;
  private shakeStart = 0;
  private shakeDur = SHAKE_MIN;
  /**
   * Ticks the picture has been held by hit-stop so far (`HitStop.held`), set by the renderer each
   * frame. Shakes run on sim time plus this, so they keep moving while the picture is frozen.
   */
  held = 0;
  /** Sky tint, additive RGB, decaying every tick. `skyFlash` is its strength. */
  readonly sky: [number, number, number] = [0, 0, 0];
  skyFlash = 0;
  /** Nuke sky whiteout: bang tick, peak strength and fade length (see whiteoutAt). */
  private whiteStart = 0;
  private whitePeak = 0;
  private whiteFade = 1;
  /** Chromatic split in cells (nukes), decaying. */
  split = 0;
  mult = 1;
  /** The current wind (cells per tick², the sim's), for what the ground sheds. */
  wind = 0;
  /** Orbital Lance lock-ons and beams. */
  readonly lances: Lances;
  /** Ion Cannon charges and beams. */
  readonly ions: IonStrikes;
  /**
   * Ricochet Ball heat: bounces of the ball in flight (0 = fresh), from its `ricochet` events.
   * Only one shot flies at a time, so a single counter is enough; it resets on the final burst
   * or after a long gap.
   */
  ricochetHeat = 0;
  private ricochetLast = -1000;
  /** Debris chunks big blasts throw: they bounce, settle and crumble away. */
  readonly chunks: Chunks;

  /** Where effects spawn particles: sooty smoke puffs are diverted into the fluid. */
  private readonly particles: ParticleSink;
  private readonly smoke: SmokeBucket[] = [];

  constructor(
    private readonly sink: ParticleSink,
    private readonly fluid: FluidSink,
    private readonly probe: TerrainProbe,
  ) {
    this.particles = { add: (e) => this.addParticle(e) };
    this.lances = new Lances(sink);
    this.ions = new IonStrikes(sink);
    this.chunks = new Chunks(
      CHUNK_CAP,
      { solid: (x, y) => probe.material(x, y) !== 0 },
      (x, y, speed) => this.thud(x, y, speed),
    );
  }

  private addParticle(e: Emit): void {
    if (e.kind !== PKind.Smoke || !sooty(e.color)) {
      this.sink.add(e);
      return;
    }
    // pool it with the other puffs of this tick that land in the same patch of the map
    const sm = this.smoke;
    for (let i = 0; i < sm.length; i++) {
      const b = sm[i]!;
      if (Math.abs(b.x / b.n - e.x) <= 24 && Math.abs(b.y / b.n - e.y) <= 24) {
        b.n++;
        b.x += e.x;
        b.y += e.y;
        b.vx += e.vx;
        b.vy += e.vy;
        b.size += e.size;
        return;
      }
    }
    if (sm.length < SMOKE_BUCKETS)
      sm.push({ n: 1, x: e.x, y: e.y, vx: e.vx, vy: e.vy, size: e.size });
  }

  /** Pour this tick's pooled smoke puffs into the fluid. */
  private flushSmoke(): void {
    const sm = this.smoke;
    for (let i = 0; i < sm.length; i++) {
      const b = sm[i]!;
      const n = b.n;
      const size = b.size / n;
      // a puff cloud's worth of soot: wider and thicker the more and bigger the puffs
      const r = Math.max(4, size * 1.2 + Math.sqrt(n) * 2);
      const amount = Math.min(1.6, 0.12 * size * Math.sqrt(n));
      this.fluid.splat(b.x / n, b.y / n, r, (b.vx / n) * 1.5, (b.vy / n) * 1.5, amount, 0);
    }
    sm.length = 0;
  }

  /** A little puff of dust where a chunk lands hard. */
  private thud(x: number, y: number, speed: number): void {
    if (this.mult < 0.5) return;
    const col = shade(this.dustColor(x, y + 1), 1.15);
    const n = speed > 2.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const side = i === 0 ? -1 : 1;
      this.particles.add({
        x: x + side,
        y: y - 1,
        vx: side * 0.25,
        vy: -0.12,
        life: 18 + Math.round(speed * 4),
        size: 2 + Math.min(2, speed * 0.5),
        color: col,
        kind: PKind.Dust,
      });
    }
  }

  private rngFor(e: EffectEvent, salt: number): FxRng {
    return new FxRng(
      (Math.imul(e.tick + 1, 2654435761) ^ Math.imul(e.x + 7, 40503) ^ Math.imul(e.y + 3, 9973)) +
        salt,
    );
  }

  /** Spawn the visual for one effect event. */
  handle(e: EffectEvent): void {
    switch (e.type) {
      case 'burst':
        this.burst(e, e.params.count ?? 24);
        break;
      case 'flash': {
        const look = DT_LOOK[e.params.dt ?? 0] ?? DT_LOOK[0]!;
        const strength = e.params.strength ?? 1;
        if (strength <= 0) break; // a silent blast (e.g. a singularity's opening pull)
        this.glows.push({
          x: e.x,
          y: e.y,
          r: e.radius * 2.2,
          start: e.tick,
          dur: 14,
          color: look[0],
          strength,
        });
        this.tintSky(look, 0.008 * e.radius * strength);
        // every blast shakes the screen by its size (manifests can ask for more with `shake`)
        this.kick(blastShake(e.radius, strength), e.tick);
        this.smokeColumn(e, e.params.dt ?? 0);
        // the biggest blasts (nukes) bloom white and split the picture's colours
        if (e.radius >= 60) {
          this.glows.push({
            x: e.x,
            y: e.y,
            r: e.radius * 1.2,
            start: e.tick,
            dur: 26,
            color: 0xfff6e0,
            strength: 1.4,
          });
          this.split = Math.max(this.split, Math.min(4, e.radius / 30));
        }
        break;
      }
      case 'nukeBlast':
        this.nuke(e);
        break;
      case 'mirvSplit':
        this.mirvSplit(e);
        break;
      case 'v3Burn':
        this.v3Burn(e);
        break;
      case 'v3Blast':
        this.v3Blast(e);
        break;
      case 'fireball':
        this.fireball(e, e.params.strength ?? 1);
        break;
      case 'meteorCall':
        this.meteorCall(e);
        break;
      case 'fireworkLaunch':
        this.fireworkLaunch(e);
        break;
      case 'fireworkBurst':
        this.fireworkBurst(e);
        break;
      case 'fireworkStar':
        this.fireworkStar(e);
        break;
      case 'geyser':
        this.geyser(e, e.params.strength ?? 1);
        break;
      case 'ricochet':
        this.ricochet(e);
        break;
      case 'ricochetBurst':
        this.ricochetBurst(e, e.params.strength ?? 1);
        break;
      case 'dirtBurst':
        this.dirtBurst(e);
        break;
      case 'shake':
        this.kick((e.params.strength ?? 1) * 3, e.tick);
        break;
      case 'ripple':
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 45,
          maxR: e.radius * 2,
          width: 16,
          strength: e.params.strength ?? 1,
        });
        break;
      case 'shockwave':
        this.fronts.push({
          x: e.x,
          y: e.y,
          maxR: e.radius,
          start: e.tick,
          dur: Math.max(4, e.params.ticks ?? 20),
          rng: this.rngFor(e, 11),
          portal: true,
        });
        if (e.radius >= 60) this.tintSky([0, 0.32, 0.22, 0.7], Math.min(0.35, e.radius / 600));
        break;
      case 'plasmaOrb':
        this.plasmaOrb(e);
        break;
      case 'plasmaZap':
        this.plasmaZap(e);
        break;
      case 'plasmaBurst':
        this.plasmaBurst(e);
        break;
      case 'shockFling': {
        // a tank ripped off its feet: a spray of hot sparks and a puff of plasma
        const rng = this.rngFor(e, 13);
        const dir = e.params.dir ?? 1;
        const n = Math.round(22 * this.mult) + 4;
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: e.x + rng.range(-e.radius, e.radius),
            y: e.y + rng.range(-2, 3),
            vx: dir * rng.range(0.6, 3.2),
            vy: -rng.range(0.4, 2.6),
            life: rng.range(12, 30),
            size: 1,
            color: rng.next() < 0.5 ? 0xffc060 : 0xff8a30,
            kind: PKind.Spark,
          });
        }
        for (let i = 0; i < 4; i++) {
          this.particles.add({
            x: e.x - dir * rng.range(0, e.radius),
            y: e.y + rng.range(-2, 2),
            vx: dir * rng.range(0.2, 0.6),
            vy: -rng.range(0, 0.3),
            life: rng.range(14, 24),
            size: 4,
            color: PORTAL[Math.floor(rng.next() * PORTAL.length)]!,
            kind: PKind.Plasma,
          });
        }
        break;
      }
      case 'portal':
        this.portal(e);
        break;
      case 'portalOpen':
      case 'portalClose':
        this.portalBurst(e.x, e.y, e.radius, RING_A, e);
        this.portalBurst(e.params.bx ?? e.x, e.params.by ?? e.y, e.radius, RING_B, e);
        break;
      case 'portalPass':
        this.portalBurst(e.x, e.y, Math.max(3, e.radius), RING_A, e);
        this.portalBurst(e.params.tx ?? e.x, e.params.ty ?? e.y, Math.max(3, e.radius), RING_B, e);
        break;
      case 'warpOut':
      case 'warpIn':
      case 'warpFizzle':
        this.warpMotes(e);
        break;
      case 'shockFly': {
        // sparks and smoke streaming off a tank flying through the air
        const rng = this.rngFor(e, 19);
        if (rng.next() < 0.7 * this.mult) {
          this.particles.add({
            x: e.x + rng.range(-e.radius, e.radius),
            y: e.y + rng.range(-2, 2),
            vx: rng.range(-0.6, 0.6),
            vy: rng.range(-0.6, 0.4),
            life: rng.range(8, 18),
            size: 1,
            color: 0xffb050,
            kind: PKind.Spark,
          });
        }
        if (rng.next() < 0.35 * this.mult) {
          this.particles.add({
            x: e.x,
            y: e.y,
            vx: 0,
            vy: -0.1,
            life: rng.range(20, 36),
            size: 3,
            color: 0x4a4448,
            kind: PKind.Smoke,
          });
        }
        break;
      }
      case 'shockSlam': {
        const rng = this.rngFor(e, 17);
        const col = this.dustColor(e.x, e.y + e.radius);
        const n = Math.round(10 * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: e.x + rng.range(-e.radius, e.radius),
            y: e.y + rng.range(-3, 3),
            vx: rng.range(-1, 1),
            vy: -rng.range(0.3, 1.4),
            life: rng.range(20, 40),
            size: rng.range(2, 4),
            color: shade(col, 1.1),
            kind: PKind.Dust,
          });
        }
        break;
      }
      case 'muzzle': {
        const rng = this.rngFor(e, 3);
        const a = ((e.params.angle ?? 90) * Math.PI) / 180;
        const n = Math.round(10 * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const s = rng.range(0.6, 2.2);
          const da = rng.range(-0.35, 0.35);
          this.particles.add({
            x: e.x,
            y: e.y,
            vx: Math.cos(a + da) * s,
            vy: -Math.sin(a + da) * s,
            life: rng.range(6, 14),
            size: rng.range(0.5, 1),
            color: 0xffb040,
            kind: PKind.Spark,
          });
        }
        for (let i = 0; i < 3; i++) {
          this.particles.add({
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * 0.4 + rng.range(-0.1, 0.1),
            vy: -Math.sin(a) * 0.4,
            life: rng.range(25, 40),
            size: rng.range(2, 3.5),
            color: 0x8a8090,
            kind: PKind.Smoke,
          });
        }
        this.glows.push({
          x: e.x,
          y: e.y,
          r: 6,
          start: e.tick,
          dur: 5,
          color: 0xffd080,
          strength: 1,
        });
        break;
      }
      case 'land': {
        const rng = this.rngFor(e, 5);
        const n = Math.round(Math.min(20, 4 + (e.params.distance ?? 0)) * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          this.particles.add({
            x: e.x + side * rng.range(4, 9),
            y: e.y - 1,
            vx: side * rng.range(0.2, 0.9),
            vy: -rng.range(0, 0.25),
            life: rng.range(20, 40),
            size: rng.range(2, 4),
            color: this.dustColor(e.x, e.y),
            kind: PKind.Dust,
          });
        }
        break;
      }
      case 'gust': {
        // a change of wind: dashes streak across the sky and dust lifts off the ridges
        const rng = this.rngFor(e, 13);
        const dir = e.params.dir ?? 1;
        const k = Math.max(0.2, (e.params.strength ?? 500) / 1000);
        const W = this.probe.width;
        const H = this.probe.height;
        const n = Math.round((10 + 26 * k) * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const x = rng.range(0, W);
          const ground = this.surfaceNear(Math.floor(x), H * 0.5, H * 0.5);
          const top = ground > 0 ? ground - 4 : H * 0.7;
          this.particles.add({
            x,
            y: rng.range(H * 0.04, Math.max(H * 0.06, top)),
            vx: dir * rng.range(1.6, 3.2) * (0.6 + k),
            vy: 0,
            life: rng.range(30, 60),
            size: Math.round(rng.range(6, 18)),
            color: 0xeef4ff,
            kind: PKind.Streak,
          });
        }
        const dust = Math.round(8 * k * this.mult);
        for (let i = 0; i < dust; i++) {
          const x = Math.floor(rng.range(0, W));
          const y = this.surfaceNear(x, H * 0.5, H * 0.5);
          if (y < 0) continue;
          this.particles.add({
            x,
            y: y - 1,
            vx: dir * rng.range(0.5, 1.4),
            vy: -rng.range(0.05, 0.3),
            life: rng.range(25, 45),
            size: rng.range(2, 4),
            color: this.dustColor(x, y + 1),
            kind: PKind.Dust,
          });
        }
        break;
      }
      case 'creak':
      case 'collapse': {
        // dust off a cracking or collapsing prop: pixel dust puffs across its footprint
        const rng = this.rngFor(e, 9);
        const big = e.type === 'collapse';
        const n = Math.round((big ? 36 : 10) * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const x = e.x + rng.range(-e.radius, e.radius);
          const y = e.y + rng.range(-e.radius, e.radius) * 0.6;
          this.particles.add({
            x,
            y,
            vx: rng.range(-0.35, 0.35),
            vy: -rng.range(0.05, big ? 0.5 : 0.25),
            life: rng.range(25, big ? 70 : 40),
            size: rng.range(2, big ? 5 : 3),
            color: this.dustColor(Math.round(x), Math.round(y)),
            kind: PKind.Dust,
          });
        }
        if (big) {
          this.kick(3, e.tick);
        }
        break;
      }
      case 'bolt':
        this.bolt(e);
        break;
      case 'lanceCharge':
        this.lances.charge(e, this.rngFor(e, 43));
        this.tintSky([0, 0.5, 0.06, 0.04], 0.12);
        break;
      case 'lance':
        this.lanceFire(e);
        break;
      case 'pressureWave':
        this.pressureWave(e, e.params.strength ?? 1);
        break;
      case 'ionCharge':
        this.ions.charge(e, this.rngFor(e, 151));
        this.ionColumnWaves(e);
        this.tintSky([0, 0.15, 0.3, 0.7], 0.15);
        break;
      case 'ionBlast':
        this.ionBlast(e, e.params.strength ?? 1);
        break;
      case 'ionPulse':
        this.ionPulse(e, e.params.strength ?? 1);
        break;
      case 'vortex':
        this.vortices.push({
          x: e.x,
          y: e.y,
          r: Math.max(10, e.radius),
          start: e.tick,
          dur: Math.max(8, e.params.ticks ?? 40),
          rng: this.rngFor(e, 61),
        });
        break;
      case 'swallow':
        this.swallow(e);
        break;
      case 'mineTrip':
        this.mineTrip(e);
        break;
      case 'eruption':
        this.eruption(e, e.params.strength ?? 1);
        break;
      case 'volcanoGrow':
        // the ground heaves as the cone pushes up: a slow ripple, a dust front, a long rumble
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 50,
          maxR: e.radius * 1.6,
          width: 10,
          strength: 0.6,
        });
        this.fronts.push({
          x: e.x,
          y: e.y,
          maxR: e.radius * 1.2,
          start: e.tick,
          dur: Math.max(10, e.params.ticks ?? 40),
          rng: this.rngFor(e, 131),
        });
        this.kick(3, e.tick);
        break;
      case 'volcanoErupt':
        this.eruption(e, 0.9);
        break;
      case 'arcs':
        this.arcs(e, e.params.strength ?? 1);
        break;
      case 'frostBlast':
        this.frostBlast(e);
        break;
      case 'glueSplat':
        this.glueSplat(e);
        break;
      case 'glued':
        this.glued(e);
        break;
      case 'unglued':
        this.unglued(e);
        break;
      case 'frostFront':
        this.fronts.push({
          x: e.x,
          y: e.y,
          maxR: e.radius,
          start: e.tick,
          dur: Math.max(4, e.params.ticks ?? 30),
          rng: this.rngFor(e, 43),
          cold: true,
        });
        break;
      case 'frosted': {
        // a tank caught in the cold: a puff of frost and glints all over it
        const rng = this.rngFor(e, 47);
        const n = Math.round(24 * this.mult) + 4;
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: e.x + rng.range(-9, 9),
            y: e.y + rng.range(-5, 4),
            vx: rng.range(-0.3, 0.3),
            vy: -rng.range(0.1, 0.8),
            life: rng.range(14, 30),
            size: 1,
            color: ICE[Math.floor(rng.next() * 3)]!,
            kind: PKind.Spark,
          });
        }
        this.puff(e, 0xd8eefa, 10);
        break;
      }
      case 'iceGrow': {
        // an ice wall's growth front: ice chips crackle off the rising top, a little cold mist
        const rng = this.rngFor(e, 71);
        const n = Math.max(1, Math.round(3 * this.mult));
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: Math.round(e.x + rng.range(-e.radius, e.radius)),
            y: e.y - 1,
            vx: rng.range(-0.6, 0.6),
            vy: -rng.range(0.3, 1.2),
            life: rng.range(10, 22),
            size: 1,
            color: ICE[Math.floor(rng.next() * 4)]!,
            kind: PKind.Spark,
          });
        }
        if (rng.next() < 0.35 * this.mult) {
          this.particles.add({
            x: e.x + rng.range(-e.radius, e.radius),
            y: e.y,
            vx: rng.range(-0.2, 0.2),
            vy: -rng.range(0.02, 0.1),
            life: rng.range(40, 80),
            size: rng.range(3, 6),
            color: rng.next() < 0.5 ? 0xe4f2fc : 0xc2def2,
            kind: PKind.Dust,
          });
        }
        break;
      }
      case 'iceWall':
        this.kick(1.5, e.tick);
        break;
      case 'quake': {
        // ground shudder: shake plus dust kicked up along the surface around the epicentre
        const strength = e.params.strength ?? 1;
        this.kick(strength * 2.5, e.tick);
        const rng = this.rngFor(e, 13);
        const n = Math.round(Math.min(40, e.radius / 4 + 6) * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const x = Math.round(e.x + rng.range(-e.radius, e.radius) * 0.5);
          const y = this.surfaceNear(x, e.y, 40);
          if (y < 0) continue;
          this.particles.add({
            x,
            y: y - 1,
            vx: rng.range(-0.3, 0.3),
            vy: -rng.range(0.1, 0.6),
            life: rng.range(25, 50),
            size: rng.range(2, 4),
            color: this.dustColor(x, y + 1),
            kind: PKind.Dust,
          });
        }
        break;
      }
      case 'tsunamiRise':
        this.kick(5, e.tick);
        break;
      case 'tsunami': {
        // the breaking lip of a Dirt Tsunami: dust blown forward off the crest, plus a rumble
        const dir = e.params.dir ?? 1;
        const rng = this.rngFor(e, 17);
        this.kick(Math.min(3, e.radius / 12), e.tick);
        const n = Math.round(Math.min(14, 3 + e.radius / 4) * this.mult) + 1;
        for (let i = 0; i < n; i++) {
          const x = Math.round(e.x - dir * rng.range(0, 6));
          const y = this.surfaceNear(x, e.y, 30);
          if (y < 0) continue;
          this.particles.add({
            x,
            y: y - 1,
            vx: dir * rng.range(0.6, 1.8),
            vy: -rng.range(0.2, 0.9),
            life: rng.range(16, 34),
            size: rng.range(1, 3),
            color: this.dustColor(x, y + 1),
            kind: PKind.Dust,
          });
        }
        break;
      }
      case 'tsunamiCrash': {
        // the wave comes down: a heavy thud and a wall of dust rolling on past the heap
        const dir = e.params.dir ?? 1;
        const rng = this.rngFor(e, 19);
        this.kick(9, e.tick);
        const n = Math.round(Math.min(60, 12 + e.radius) * this.mult) + 2;
        for (let i = 0; i < n; i++) {
          const x = Math.round(e.x + dir * rng.range(-e.radius, e.radius * 1.5));
          const y = this.surfaceNear(x, e.y, 60);
          if (y < 0) continue;
          this.particles.add({
            x,
            y: y - Math.round(rng.range(1, 6)),
            vx: dir * rng.range(0.2, 1.4),
            vy: -rng.range(0.1, 0.7),
            life: rng.range(30, 60),
            size: rng.range(2, 4),
            color: this.dustColor(x, y + 1),
            kind: PKind.Dust,
          });
        }
        break;
      }
      case 'rift':
        this.rift(e);
        break;
      case 'sinkhole':
        this.sinkhole(e);
        break;
      case 'sinkholeDust':
        this.sinkholeDust(e);
        break;
      case 'resonate':
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 36,
          maxR: e.radius * 1.4,
          width: 10,
          strength: 0.8,
        });
        this.glows.push({
          x: e.x,
          y: e.y,
          r: e.radius,
          start: e.tick,
          dur: 18,
          color: 0xb070ff,
          strength: 1,
        });
        this.tintSky([0, 0.36, 0.18, 0.6], 0.25);
        break;
      case 'zone':
        this.puff(e, ZONE_COLOR[e.params.look ?? 0] ?? 0x9ab83a, 30);
        break;
      case 'gasBurst':
        this.gasBurst(e);
        break;
      case 'reflect':
        this.reflect(e);
        break;
      case 'railHit':
        this.railHit(e);
        break;
      case 'pocketBurst':
        this.pocketBurst(e);
        break;
      case 'zoneHurt':
        this.puff(e, 0xb8f040, 8);
        break;
      case 'rusted':
      case 'rustHurt':
        this.rustFlakes(e, e.type === 'rusted' ? 14 : 8);
        break;
      case 'rustWobble':
        // the rusty barrel judders: a few flakes shaken off the muzzle end
        this.rustFlakes(e, 4);
        break;
      case 'burn': {
        const rng = this.rngFor(e, 17);
        const n = Math.round(14 * this.mult) + 3;
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: e.x + rng.range(-e.radius, e.radius),
            y: e.y + rng.range(0, 3),
            vx: rng.range(-0.2, 0.2),
            vy: -rng.range(0.4, 1.1),
            life: rng.range(10, 24),
            size: 1,
            color: rng.next() < 0.4 ? 0xffe070 : 0xff6a1a,
            kind: PKind.Spark,
          });
        }
        break;
      }
      case 'implode': {
        // grit sucked inward toward the centre
        const rng = this.rngFor(e, 19);
        const n = Math.round(40 * this.mult) + 4;
        const life = Math.max(8, e.params.ticks ?? 20);
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, Math.PI * 2);
          const r = e.radius * rng.range(0.7, 1.1);
          this.particles.add({
            x: e.x + Math.cos(a) * r,
            y: e.y + Math.sin(a) * r,
            vx: (-Math.cos(a) * r) / life,
            vy: (-Math.sin(a) * r) / life,
            life,
            size: 1,
            color: rng.next() < 0.5 ? 0xd0b0ff : 0x8060c0,
            kind: PKind.Spark,
          });
        }
        this.tintSky([0, 0.2, 0.1, 0.4], 0.2);
        break;
      }
      case 'mudGeyser':
        this.mudGeyser(e);
        break;
      case 'mudSplat':
        this.mudSplat(e, e.params.count ?? 12);
        break;
      case 'tornado':
        this.tornado(e);
        break;
      case 'magnet':
        this.magnet(e);
        break;
      case 'kaiju':
        this.kaiju(e);
        break;
      case 'gravityWell':
        this.gravityWell(e);
        break;
      case 'wellOpen':
        // space dimples in: a ring of distortion closing on the spot, a violet flash
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 24,
          maxR: e.radius,
          width: 8,
          strength: 0.6,
        });
        this.glows.push({
          x: e.x,
          y: e.y,
          r: 10,
          start: e.tick,
          dur: 12,
          color: 0xa060ff,
          strength: 0.8,
        });
        this.tintSky([0, 0.25, 0.08, 0.5], 0.2);
        break;
      case 'rogueHole':
        this.rogueHole(e);
        break;
      case 'holeOpen':
        this.glows.push({
          x: e.x,
          y: e.y,
          r: 16,
          start: e.tick,
          dur: 12,
          color: 0xa060ff,
          strength: 1,
        });
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 26,
          maxR: 90,
          width: 10,
          strength: 0.9,
        });
        this.tintSky([0, 0.3, 0.05, 0.55], 0.3);
        this.kick(3, e.tick);
        break;
      case 'holeSwallow':
        this.wellSwallow(e);
        break;
      case 'holeBite':
        this.holeBite(e);
        break;
      case 'holeClose':
        this.vortices.push({
          x: e.x,
          y: e.y,
          r: 18,
          start: e.tick,
          dur: Math.max(8, e.params.sink ?? 40),
          rng: this.rngFor(e, 157),
          snap: true,
        });
        break;
      case 'supernova':
        this.supernova(e);
        break;
      case 'supernovaIgnite':
        this.glows.push({
          x: e.x,
          y: e.y,
          r: 14,
          start: e.tick,
          dur: 14,
          color: 0xffd060,
          strength: 1,
        });
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 20,
          maxR: 50,
          width: 8,
          strength: 0.6,
        });
        break;
      case 'supernovaBurst':
        this.supernovaBurst(e);
        break;
      case 'wellSwallow':
        this.wellSwallow(e);
        break;
      case 'wellClose':
        this.vortices.push({
          x: e.x,
          y: e.y,
          r: 14,
          start: e.tick,
          dur: Math.max(8, e.params.sink ?? 30),
          rng: this.rngFor(e, 131),
          snap: true,
        });
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick + Math.max(4, e.params.sink ?? 30),
          dur: 26,
          maxR: e.radius * 1.4,
          width: 10,
          strength: 1,
        });
        break;
      case 'kaijuQuake': {
        // the ground shudders and cracks open along the surface before it bursts
        const k = e.params.k ?? 0;
        this.kick(1 + Math.min(3, k / 8), e.tick);
        const rng = this.rngFor(e, 101);
        for (let i = 0; i < 3; i++)
          this.dirtPop({ ...e, x: e.x + rng.range(-e.radius, e.radius) }, 4);
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 14,
          maxR: e.radius * 1.4,
          width: 6,
          strength: 0.35,
        });
        break;
      }
      case 'kaijuBurst':
        this.dirtPop(e, 70);
        this.dirtPop({ ...e, x: e.x - e.radius }, 25);
        this.dirtPop({ ...e, x: e.x + e.radius }, 25);
        this.kick(6, e.tick);
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 30,
          maxR: 110,
          width: 14,
          strength: 1,
        });
        this.tintSky([0, 0.3, 0.15, 0.05], 0.25);
        break;
      case 'kaijuRise':
        this.dirtPop(e, 30);
        this.kick(3, e.tick);
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 40,
          maxR: 70,
          width: 12,
          strength: 0.6,
        });
        break;
      case 'kaijuRoar':
        this.kick(5, e.tick);
        this.ripples.push({
          x: e.x,
          y: e.y + 8,
          start: e.tick,
          dur: 36,
          maxR: 120,
          width: 14,
          strength: 0.9,
        });
        this.tintSky([0, 0.35, 0.12, 0.05], 0.3);
        break;
      case 'kaijuGrab':
      case 'kaijuRip':
      case 'kaijuSink':
        this.dirtPop(e, 18);
        break;
      case 'kaijuThrow':
      case 'kaijuToss':
        this.dirtPop(e, 10);
        this.kick(2, e.tick);
        break;
      case 'kaijuFly':
        if ((e.tick & 1) === 0) this.dirtPop(e, 1);
        break;
      case 'kaijuBounce':
        this.dirtPop(e, 14);
        this.kick(2, e.tick);
        break;
      case 'kaijuSlam':
        this.dirtPop(e, 34);
        this.kick(5, e.tick);
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 24,
          maxR: 40,
          width: 8,
          strength: 0.8,
        });
        break;
      case 'kaijuTopple':
        // dug out: it staggers, roars and keels over
        this.dirtPop(e, 40);
        this.kick(4, e.tick);
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 30,
          maxR: 90,
          width: 12,
          strength: 0.8,
        });
        break;
      case 'kaijuBlast':
        this.kaijuBlast(e);
        break;
      case 'kaijuCatch':
        this.catchSparks(e);
        this.kick(2, e.tick);
        break;
      case 'magnetOn':
        // the field kicks in: a jolt and a short drop in the sky's light
        this.kick(2, e.tick);
        this.tintSky([0, 0.05, 0.2, 0.3], 0.15);
        break;
      case 'magnetClank': {
        // a tank slams onto the mine: hard white and cyan sparks off the contact
        const rng = this.rngFor(e, 67);
        const n = Math.round(18 * this.mult) + 3;
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: e.x + rng.range(-3, 3),
            y: e.y + rng.range(-2, 2),
            vx: rng.range(-1.6, 1.6),
            vy: -rng.range(0.3, 1.8),
            life: rng.range(8, 20),
            size: 1,
            color: rng.next() < 0.5 ? 0xffffff : 0x7fd8f0,
            kind: PKind.Spark,
          });
        }
        this.kick(3, e.tick);
        break;
      }
      case 'touchdown': {
        // the funnel hits the ground: a jolt and a ring of dust thrown out along the surface
        this.kick(3, e.tick);
        this.fronts.push({
          x: e.x,
          y: e.y,
          maxR: 46,
          start: e.tick,
          dur: 24,
          rng: this.rngFor(e, 43),
        });
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 30,
          maxR: 60,
          width: 10,
          strength: 0.7,
        });
        break;
      }
      case 'tornadoGrab':
      case 'tornadoThrow': {
        const rng = this.rngFor(e, 47);
        const n = Math.round(14 * this.mult) + 2;
        const col = this.dustColor(e.x, e.y + 2);
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: e.x + rng.range(-8, 8),
            y: e.y - rng.range(0, 6),
            vx: rng.range(-1.2, 1.2),
            vy: -rng.range(0.2, 1.4),
            life: rng.range(20, 40),
            size: 1,
            color: shade(col, rng.range(0.7, 1.2)),
            kind: PKind.Chunk,
          });
        }
        if (e.type === 'tornadoGrab') {
          this.kick(2, e.tick);
        }
        break;
      }
      case 'bumper':
        this.posts.push(makePost(e.x, e.y + 1, e.tick, e.params.windup ?? 10));
        this.dirtPop(e, 10);
        break;
      case 'bumpKick':
        this.bumpKick(e);
        break;
      case 'bumpLaunch':
        this.dirtPop(e, 14);
        this.stars(e, 12, 1.6);
        break;
      case 'bumpFly':
        this.stars(e, 2, 0.4);
        break;
      case 'bumpBounce':
        this.stars(e, 14, 1.4);
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 14,
          maxR: 18,
          width: 5,
          strength: 0.5,
        });
        this.kick(2, e.tick);
        break;
      case 'tornadoEnd': {
        // the funnel breaks up: a burst of storm dust where it stood
        const rng = this.rngFor(e, 53);
        const n = Math.round(40 * this.mult) + 4;
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, Math.PI * 2);
          const s = rng.range(0.3, 1.4);
          this.particles.add({
            x: e.x + Math.cos(a) * e.radius * 0.5,
            y: e.y + Math.sin(a) * e.radius * 1.2,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s * 0.6,
            life: rng.range(40, 80),
            size: rng.range(3, 7),
            color: rng.next() < 0.5 ? 0x5e5a68 : 0x7a7684,
            kind: PKind.Smoke,
          });
        }
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 36,
          maxR: e.radius * 3,
          width: 12,
          strength: 0.8,
        });
        break;
      }
      case 'tankDeath':
        this.burst(e, 70);
        this.glows.push({
          x: e.x,
          y: e.y,
          r: 40,
          start: e.tick,
          dur: 20,
          color: 0xff9040,
          strength: 1.2,
        });
        this.tintSky(DT_LOOK[2]!, 0.5);
        this.kick(7, e.tick);
        break;
      default:
        break; // unknown effect: ignored by contract
    }
  }

  /**
   * A nuke's main blast: the mushroom cloud, a map-wide distortion shockwave (the approved moving-pixel lens band,
   * scaled up, no light ring), a ground dust front, and debris and sparks thrown out from the
   * centre in every direction.
   */
  private nuke(e: EffectEvent): void {
    const r = e.radius;
    const k = e.params.strength ?? 1;
    // the whole sky goes white with the bang, then slowly fades back (a second nuke restarts it)
    const w = whiteoutFor(r * k);
    const now = this.whiteout(e.tick);
    this.whiteStart = e.tick;
    this.whitePeak = Math.max(w.peak, now);
    this.whiteFade = Math.max(w.fade, now > 0 ? this.whiteFade : 1);
    // the mushroom cloud starts with the bang, together with the shockwave
    this.mushrooms.push(makeMushroom(e.x, e.y, r, e.tick, this.rngFor(e, 31).next() * 4294967296));
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 70,
      maxR: r * 7,
      width: 26,
      strength: 1.5 * k,
    });
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick + 6,
      dur: 60,
      maxR: r * 4.5,
      width: 12,
      strength: 0.9 * k,
    });
    this.fronts.push({
      x: e.x,
      y: e.y,
      maxR: r * 4,
      start: e.tick,
      dur: 46,
      rng: this.rngFor(e, 37),
    });
    this.kick(4 + r / 12, e.tick);
    const rng = this.rngFor(e, 41);
    const base = this.dustColor(e.x, e.y + r * 0.5);
    const n = Math.round((120 + r * 2) * this.mult);
    const fast = 3 + r / 20;
    for (let i = 0; i < n; i++) {
      // a full circle, biased upward: whatever is below is ground and stops it anyway
      const a = rng.range(-0.15, 1.15) * Math.PI;
      const s = rng.range(0.35, 1) * fast;
      const spark = i % 2 === 0;
      this.particles.add({
        x: e.x + Math.cos(a) * r * 0.3,
        y: e.y - Math.sin(a) * r * 0.3,
        vx: Math.cos(a) * s,
        vy: -Math.sin(a) * s,
        life: rng.range(50, 100),
        size: spark ? 1 : rng.range(1.5, 2.5),
        color: spark ? (rng.next() < 0.4 ? 0xfff0a0 : 0xff7a1a) : shade(base, rng.range(0.7, 1.2)),
        kind: spark ? PKind.Spark : PKind.Chunk,
      });
    }
  }

  /**
   * A MIRV splitting at its apex: a hard white pop, a ring of sparks flung out in every direction,
   * a small lens ripple and a puff of grey smoke left hanging where the bus broke apart.
   */
  /**
   * A V3 stage lighting (and the one below it dropping away): a white flare, a hard ring of
   * gold-white sparks, a collar of grey smoke where the stages part, and a jolt.
   */
  private v3Burn(e: EffectEvent): void {
    const rng = this.rngFor(e, 71);
    const top = (e.params.stage ?? 2) >= 3;
    this.glows.push({
      x: e.x,
      y: e.y,
      r: top ? 14 : 9,
      start: e.tick,
      dur: 7,
      color: 0xfff0c0,
      strength: 1.3,
    });
    const n = Math.round((top ? 40 : 28) * this.mult) + 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.08, 0.08);
      const v = rng.range(1.2, 2.4);
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(8, 16),
        size: 1,
        color: i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffd060 : 0xff8a30,
        kind: PKind.Spark,
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.particles.add({
        x: e.x + Math.cos(a) * 3,
        y: e.y + Math.sin(a) * 2,
        vx: Math.cos(a) * 0.25,
        vy: Math.sin(a) * 0.12,
        life: rng.range(50, 80),
        size: rng.range(3, 5),
        color: rng.next() < 0.5 ? 0xb0aab4 : 0x8a8490,
        kind: PKind.Smoke,
      });
    }
    this.kick(top ? 2 : 1.2, e.tick);
  }

  /**
   * The V3 warhead hitting home: a pillar of fire and white sparks thrown straight back up the
   * dive path, and a deep ring of falling embers.
   */
  private v3Blast(e: EffectEvent): void {
    const rng = this.rngFor(e, 73);
    const n = Math.round(70 * this.mult) + 16;
    for (let i = 0; i < n; i++) {
      const v = rng.range(1.5, 5.5);
      this.particles.add({
        x: e.x + rng.range(-3, 3),
        y: e.y,
        vx: rng.range(-0.5, 0.5),
        vy: -v,
        life: rng.range(14, 34),
        size: 1,
        color: i % 4 === 0 ? 0xffffff : i % 4 === 1 ? 0xfff0a0 : 0xffa030,
        kind: PKind.Spark,
      });
    }
    const f = Math.round(26 * this.mult) + 6;
    for (let i = 0; i < f; i++) {
      this.particles.add({
        x: e.x + rng.range(-4, 4),
        y: e.y - rng.range(0, 30),
        vx: rng.range(-0.15, 0.15),
        vy: -rng.range(0.3, 1.2),
        life: rng.range(14, 26),
        size: rng.range(2, 4),
        color: 0,
        kind: PKind.Flame,
      });
    }
    for (let i = 0; i < f; i++) {
      const a = rng.range(Math.PI * 1.05, Math.PI * 1.95);
      const v = rng.range(1, 3);
      this.particles.add({
        x: e.x,
        y: e.y - 2,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(40, 70),
        size: 1,
        color: rng.next() < 0.5 ? 0xff7a20 : 0xffc040,
        kind: PKind.Ember,
      });
    }
  }

  private mirvSplit(e: EffectEvent): void {
    const rng = this.rngFor(e, 43);
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 12,
      start: e.tick,
      dur: 8,
      color: 0xd8f0ff,
      strength: 1.4,
    });
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 22,
      maxR: 46,
      width: 8,
      strength: 0.9,
    });
    const n = Math.round(48 * this.mult) + 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.06, 0.06);
      const s = rng.range(1.6, 3.2);
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rng.range(12, 22),
        size: 1,
        color: i % 3 === 0 ? 0xffffff : rng.next() < 0.5 ? 0x9ad8ff : 0xffe070,
        kind: PKind.Spark,
      });
    }
    for (let i = 0; i < 6; i++) {
      this.particles.add({
        x: e.x + rng.range(-3, 3),
        y: e.y + rng.range(-2, 2),
        vx: rng.range(-0.15, 0.15),
        vy: -rng.range(0, 0.1),
        life: rng.range(50, 80),
        size: rng.range(3, 5),
        color: rng.next() < 0.5 ? 0x8a8090 : 0x6a6070,
        kind: PKind.Smoke,
      });
    }
    this.tintSky(DT_LOOK[4]!, 0.15);
    this.kick(2, e.tick);
  }

  /**
   * Cluster Fireworks popping at the top of its arc: a small white pop, a ring of gold sparks and
   * a puff of grey smoke where the rockets broke away.
   */
  private fireworkLaunch(e: EffectEvent): void {
    const rng = this.rngFor(e, 61);
    this.glows.push({ x: e.x, y: e.y, r: 5, start: e.tick, dur: 6, color: 0xfff0c0, strength: 1 });
    const n = Math.round(20 * this.mult) + 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const v = rng.range(0.8, 1.6);
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(10, 18),
        size: 1,
        color: i % 3 === 0 ? 0xffffff : 0xffd060,
        kind: PKind.Spark,
      });
    }
    for (let i = 0; i < 4; i++) {
      this.particles.add({
        x: e.x + rng.range(-2, 2),
        y: e.y + rng.range(-2, 2),
        vx: rng.range(-0.1, 0.1),
        vy: -rng.range(0, 0.08),
        life: rng.range(40, 70),
        size: rng.range(2, 4),
        color: 0x8a8490,
        kind: PKind.Smoke,
      });
    }
  }

  /**
   * One firework bursting: a white pop, then a sphere of strobing stars in one colour around an
   * inner ring of another, flung out hard and braking into a drooping ball. A moment later the
   * ball crackles with white flecks. The sky flickers in the burst's colour.
   */
  private fireworkBurst(e: EffectEvent): void {
    const rng = this.rngFor(e, 67);
    const main = FIREWORK[Math.floor(rng.next() * FIREWORK.length)]!;
    let inner: number = FIREWORK[Math.floor(rng.next() * FIREWORK.length)]!;
    if (inner === main) inner = 0xffffff;
    this.fireworks.push({ x: e.x, y: e.y, start: e.tick, main, inner, rng });
    this.glows.push({ x: e.x, y: e.y, r: 6, start: e.tick, dur: 5, color: main, strength: 1.2 });
    const n = Math.round(56 * this.mult) + 12;
    const tilt = rng.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = tilt + (i / n) * Math.PI * 2;
      // a ball, not a ring: speeds spread over the sphere's projection onto the screen
      const v = 1.2 * Math.sqrt(1 - rng.next() * rng.next());
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(48, 70),
        size: 1,
        color: main,
        kind: PKind.Glitter,
      });
    }
    const m = Math.round(20 * this.mult) + 6;
    for (let i = 0; i < m; i++) {
      const a = tilt + (i / m) * Math.PI * 2 + 0.1;
      const v = rng.range(0.42, 0.55);
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rng.range(34, 46),
        size: 1,
        color: inner,
        kind: PKind.Glitter,
      });
    }
    const r = (main >> 16) & 255;
    const g = (main >> 8) & 255;
    const b = main & 255;
    this.tintSky([main, r / 255, g / 255, b / 255], 0.03);
  }

  /** A burning star landing: a tiny pop of sparks in its colour kicked up off the ground. */
  private fireworkStar(e: EffectEvent): void {
    const rng = this.rngFor(e, 71);
    const found = this.fireworkColor(e.x, e.tick, false);
    const c = found < 0 ? 0xffd040 : found;
    const n = Math.round(8 * this.mult) + 3;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: e.x + rng.range(-1, 1),
        y: e.y - 1,
        vx: rng.range(-0.7, 0.7),
        vy: -rng.range(0.4, 1.2),
        life: rng.range(10, 20),
        size: 1,
        color: i % 3 === 0 ? 0xffffff : c,
        kind: PKind.Spark,
      });
    }
    this.glows.push({ x: e.x, y: e.y - 1, r: 3, start: e.tick, dur: 4, color: c, strength: 0.8 });
  }

  /**
   * Main colour of the firework burst a star at column `x` most likely came from, or -1 if there
   * is none. A star just born (`born`) belongs to the newest burst, nearest sideways; a star
   * landing to the nearest recent burst above it.
   */
  fireworkColor(x: number, t: number, born: boolean): number {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.fireworks.length; i++) {
      const f = this.fireworks[i]!;
      if (f.start > t) continue;
      const d = (t - f.start) * (born ? 4 : 0.3) + Math.abs(f.x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best < 0 ? -1 : this.fireworks[best]!.main;
  }

  /** Inner ring colour of the burst whose main colour is `main` (for a star's glitter trail). */
  fireworkInner(main: number): number {
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const f = this.fireworks[i]!;
      if (f.main === main) return f.inner;
    }
    return 0xffffff;
  }

  /** Bursts crackle: white flecks winking on across the ball a moment after it opens. */
  private fireworkTick(t: number): void {
    this.fireworks = this.fireworks.filter((f) => t - f.start <= FIREWORK_KEEP);
    for (const f of this.fireworks) {
      const age = t - f.start;
      if (age < FIREWORK_CRACKLE || age > FIREWORK_CRACKLE + 8) continue;
      const n = Math.max(1, Math.round(3 * this.mult));
      const reach = 17 + (age - FIREWORK_CRACKLE);
      for (let i = 0; i < n; i++) {
        const a = f.rng.range(0, Math.PI * 2);
        const d = reach * Math.sqrt(f.rng.next());
        this.particles.add({
          x: f.x + Math.cos(a) * d,
          y: f.y + Math.sin(a) * d + (age - FIREWORK_CRACKLE) * 0.4,
          vx: 0,
          vy: 0.05,
          life: f.rng.range(4, 9),
          size: 1,
          color: 0xffffff,
          kind: PKind.Spark,
        });
      }
    }
  }

  /**
   * A dirt geyser: a column of the ground the blast went into, thrown straight up and raining back
   * down, with dust boiling up the column. Scales with the blast radius.
   */
  private geyser(e: EffectEvent, k: number): void {
    const rng = this.rngFor(e, 47);
    const r = Math.max(6, e.radius);
    const base = this.dustColor(e.x, e.y + r * 0.4);
    const up = (2.2 + r / 10) * k;
    const n = Math.round((30 + r * 1.5) * k * this.mult) + 4;
    for (let i = 0; i < n; i++) {
      const spread = rng.range(-1, 1);
      this.particles.add({
        x: e.x + spread * r * 0.35,
        y: e.y - rng.range(0, r * 0.3),
        vx: spread * rng.range(0.1, 0.7),
        vy: -rng.range(0.45, 1) * up,
        life: rng.range(45, 80),
        size: rng.next() < 0.3 ? 2 : 1,
        color: shade(base, rng.range(0.65, 1.15)),
        kind: PKind.Chunk,
      });
    }
    const nd = Math.round((6 + r / 3) * k * Math.max(0.5, this.mult));
    for (let i = 0; i < nd; i++) {
      this.particles.add({
        x: e.x + rng.range(-r, r) * 0.3,
        y: e.y - rng.range(0, r * 1.2),
        vx: rng.range(-0.2, 0.2),
        vy: -rng.range(0.2, 0.9) * k,
        life: rng.range(40, 75),
        size: rng.range(r * 0.2, r * 0.4),
        color: shade(base, rng.range(0.9, 1.2)),
        kind: PKind.Dust,
      });
    }
  }

  /**
   * An incendiary fireball: a rolling ball of fire puffs boiling upward, burning out into a column
   * of thick black smoke, with sparks and burning gobs thrown up through it.
   */
  private fireball(e: EffectEvent, k: number): void {
    const rng = this.rngFor(e, 53);
    const r = Math.max(6, e.radius) * k * 1.5;
    const nf = Math.round((14 + r * 1.5) * Math.max(0.5, this.mult));
    for (let i = 0; i < nf; i++) {
      const hot = rng.next();
      this.particles.add({
        x: e.x + rng.range(-r, r) * 0.6,
        y: e.y - rng.range(0, r * 0.8),
        vx: rng.range(-0.35, 0.35),
        vy: -rng.range(0.4, 1.2) * (0.8 + k * 0.2),
        life: rng.range(30, 56) * (hot < 0.5 ? 1 : 0.8),
        size: rng.range(r * 0.35, r * 0.7),
        color: 0,
        kind: PKind.Flame,
      });
    }
    const ns = Math.round((10 + r) * Math.max(0.5, this.mult));
    for (let i = 0; i < ns; i++) {
      this.particles.add({
        x: e.x + rng.range(-r, r) * 0.4,
        y: e.y - rng.range(r * 0.4, r * 1.4),
        vx: rng.range(-0.2, 0.2),
        vy: -rng.range(0.3, 0.8),
        life: rng.range(100, 160),
        size: rng.range(r * 0.5, r * 0.9),
        color: rng.next() < 0.5 ? 0x241e22 : 0x3a3034,
        kind: PKind.Smoke,
      });
    }
    const nk = Math.round((20 + r * 1.5) * this.mult);
    for (let i = 0; i < nk; i++) {
      const a = rng.range(0.15, 0.85) * Math.PI;
      const sp = rng.range(0.8, 2.6) * (0.7 + k * 0.3);
      this.particles.add({
        x: e.x,
        y: e.y - 2,
        vx: Math.cos(a) * sp,
        vy: -Math.sin(a) * sp,
        life: rng.range(20, 45),
        size: 1,
        color: rng.next() < 0.4 ? 0xffe070 : 0xff6a14,
        kind: PKind.Spark,
      });
    }
    this.tintSky(DT_LOOK[2]!, 0.25 * k);
  }

  /**
   * A huge pressure wave without fire (Heavy Shockwave, a Singularity's blow-out): a wide lens
   * band racing out over the map, a second tighter one behind it, a dust wall along the ground
   * and a ring of dirt clods thrown flat and fast.
   */
  private pressureWave(e: EffectEvent, k: number): void {
    const r = Math.max(20, e.radius);
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 60,
      maxR: r * 3.2 * k,
      width: 22,
      strength: 1.4 * k,
    });
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick + 5,
      dur: 50,
      maxR: r * 2,
      width: 10,
      strength: 0.8 * k,
    });
    this.fronts.push({
      x: e.x,
      y: e.y,
      maxR: r * 1.3,
      start: e.tick,
      dur: 30,
      rng: this.rngFor(e, 67),
    });
    this.kick(3 + (r / 25) * k, e.tick);
    this.tintSky([0, 0.55, 0.6, 0.75], 0.25 * k);
    const rng = this.rngFor(e, 71);
    const base = this.dustColor(e.x, e.y + 4);
    const n = Math.round((60 + r) * k * this.mult);
    for (let i = 0; i < n; i++) {
      // flat and fast: mostly sideways, a little up
      const side = i % 2 === 0 ? -1 : 1;
      const a = rng.range(0.05, 0.45) * Math.PI;
      const s = rng.range(1.5, 4.5) * (0.6 + r / 150);
      this.particles.add({
        x: e.x + side * rng.range(2, r * 0.2),
        y: e.y - rng.range(0, 4),
        vx: side * Math.cos(a) * s,
        vy: -Math.sin(a) * s,
        life: rng.range(40, 80),
        size: rng.next() < 0.3 ? 2 : 1,
        color: shade(base, rng.range(0.7, 1.2)),
        kind: PKind.Chunk,
      });
    }
  }

  /**
   * A volcanic eruption (Magma Bomb): a fountain of glowing lava bombs and sparks thrown high,
   * a short burst of fire at the vent and a plume of dark ash rolling up.
   */
  private eruption(e: EffectEvent, k: number): void {
    const rng = this.rngFor(e, 73);
    const r = Math.max(10, e.radius);
    const n = Math.round((40 + r) * k * this.mult);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0.3, 0.7) * Math.PI;
      const s = rng.range(2, 5.5) * k;
      const lump = i % 3 === 0;
      this.particles.add({
        x: e.x + rng.range(-r, r) * 0.25,
        y: e.y - 2,
        vx: Math.cos(a) * s,
        vy: -Math.sin(a) * s,
        life: rng.range(40, 75),
        size: lump ? 2 : 1,
        color: lump
          ? rng.next() < 0.5
            ? 0xff5a1f
            : 0xd8400c
          : rng.next() < 0.4
            ? 0xffe070
            : 0xff8a20,
        kind: lump ? PKind.Chunk : PKind.Spark,
      });
    }
    const nf = Math.round((10 + r / 2) * Math.max(0.5, this.mult));
    for (let i = 0; i < nf; i++) {
      this.particles.add({
        x: e.x + rng.range(-r, r) * 0.3,
        y: e.y - rng.range(0, r * 0.4),
        vx: rng.range(-0.3, 0.3),
        vy: -rng.range(0.6, 1.6),
        life: rng.range(24, 44),
        size: rng.range(3, 7),
        color: 0,
        kind: PKind.Flame,
      });
    }
    const ns = Math.round((10 + r / 2) * Math.max(0.5, this.mult));
    for (let i = 0; i < ns; i++) {
      this.particles.add({
        x: e.x + rng.range(-r, r) * 0.3,
        y: e.y - rng.range(r * 0.3, r * 1.6),
        vx: rng.range(-0.2, 0.2),
        vy: -rng.range(0.3, 0.9),
        life: rng.range(110, 170),
        size: rng.range(r * 0.3, r * 0.6),
        color: rng.next() < 0.5 ? 0x2a2224 : 0x40363a,
        kind: PKind.Smoke,
      });
    }
    this.tintSky(DT_LOOK[2]!, 0.35 * k);
    this.kick(4 * k, e.tick);
  }

  /** Singularity cores: a black pixel disc with a violet rim, growing as the hang goes on. */
  drawVortices(normal: QuadBatch, additive: QuadBatch, t: number): void {
    for (const v of this.vortices) {
      const k = (t - v.start) / v.dur;
      if (k < 0 || k > 1) continue;
      if (v.snap) {
        // opens wide in the first few ticks, then slams shut; hard bands, whole cells
        const open = Math.min(1, k * 6);
        const size = 2 * Math.max(1, Math.round(v.r * 0.55 * open * (1 - k) * (1 - k))) + 1;
        additive.push(
          v.x + 0.5,
          v.y + 0.5,
          size + 6,
          size + 6,
          0x6020d0,
          0.5 * (1 - k),
          Shape.Pixel,
        );
        normal.push(v.x + 0.5, v.y + 0.5, size + 2, size + 2, 0xc8a0ff, 1, Shape.Pixel);
        normal.push(v.x + 0.5, v.y + 0.5, size, size, 0x05030a, 1, Shape.Pixel);
        continue;
      }
      const core = 3 + Math.round(k * k * v.r * 0.18);
      additive.push(v.x, v.y, core * 2 + 6, core * 2 + 6, 0x8040ff, 0.35 + 0.3 * k, Shape.Pixel);
      normal.push(v.x, v.y, core * 2 + 2, core * 2 + 2, 0xd0b0ff, 0.9, Shape.Pixel);
      normal.push(v.x, v.y, core * 2, core * 2, 0x07040c, 1, Shape.Pixel);
    }
  }

  /**
   * A tripped Black Hole Mine: a hard violet ring snaps out to the trip radius, the sky goes
   * purple, and a few sparks jump off the mine before the vortex takes over.
   */
  private mineTrip(e: EffectEvent): void {
    const rng = this.rngFor(e, 71);
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 18,
      maxR: e.radius * 2,
      width: 6,
      strength: 0.5,
    });
    this.glows.push({
      x: e.x,
      y: e.y,
      r: Math.max(6, e.radius * 0.5),
      start: e.tick,
      dur: 10,
      color: 0xa060ff,
      strength: 0.9,
    });
    const n = Math.round(16 * this.mult) + 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = rng.range(1.2, 2.2);
      this.particles.add({
        x: e.x,
        y: e.y - 1,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.7,
        life: rng.range(8, 14),
        size: 1,
        color: rng.next() < 0.4 ? 0xffffff : 0xb070ff,
        kind: PKind.Spark,
      });
    }
    this.tintSky([0, 0.36, 0.08, 0.6], 0.35);
  }

  /**
   * A Black Hole Mine's end: the hole slams shut. Everything near it streaks inward and vanishes
   * (no debris thrown out), then the space around it springs back in a distortion band.
   */
  private swallow(e: EffectEvent): void {
    const rng = this.rngFor(e, 73);
    const r = Math.max(8, e.radius);
    const dur = Math.max(8, e.params.ticks ?? 22);
    this.vortices.push({ x: e.x, y: e.y, r, start: e.tick, dur, rng, snap: true });
    const n = Math.round(70 * this.mult) + 20;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = r * rng.range(0.6, 1.5);
      const life = rng.range(6, 14);
      const cx = Math.round(e.x + Math.cos(a) * rr);
      const cy = Math.round(e.y + Math.sin(a) * rr * 0.8);
      const m = this.probe.material(cx, cy);
      this.particles.add({
        x: cx,
        y: cy,
        vx: (e.x - cx) / life,
        vy: (e.y - cy) / life,
        life,
        size: 1,
        color:
          m !== 0 && rng.next() < 0.6
            ? this.probe.color(m)
            : rng.next() < 0.5
              ? 0xd8c0ff
              : 0x7040e0,
        kind: PKind.Spark,
      });
    }
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick + Math.round(dur * 0.7),
      dur: 26,
      maxR: r * 2.6,
      width: 9,
      strength: 1.1,
    });
    this.tintSky([0, 0.3, 0.05, 0.55], 0.5);
    this.split = Math.max(this.split, 1);
  }

  /**
   * A Meteor Shower's mark: a red flare shoots straight up out of the ground and the sky turns
   * an ominous red before the meteors come in.
   */
  private meteorCall(e: EffectEvent): void {
    const rng = this.rngFor(e, 59);
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 30,
      maxR: 40,
      width: 8,
      strength: 0.6,
    });
    const n = Math.round(40 * this.mult) + 10;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: e.x + rng.range(-1, 1),
        y: e.y - 2,
        vx: rng.range(-0.25, 0.25),
        vy: -rng.range(2.5, 6),
        life: rng.range(25, 50),
        size: rng.next() < 0.3 ? 2 : 1,
        color: rng.next() < 0.3 ? 0xffe070 : 0xff3a20,
        kind: PKind.Spark,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.particles.add({
        x: e.x + rng.range(-3, 3),
        y: e.y - rng.range(2, 14),
        vx: rng.range(-0.1, 0.1),
        vy: -rng.range(0.1, 0.4),
        life: rng.range(60, 100),
        size: rng.range(3, 6),
        color: 0x8a2a24,
        kind: PKind.Smoke,
      });
    }
    this.tintSky(DT_LOOK[2]!, 0.45);
  }

  /**
   * Frost Bomb burst: a hard-banded white-blue flash and a cold sky, a starburst of ice spikes,
   * shards of ice and glints thrown out, a second, tighter distortion band, and then cold mist
   * along the ground and snow drifting down over the whole frozen area.
   */
  private frostBlast(e: EffectEvent): void {
    const r = e.radius;
    const k = e.params.strength ?? 1;
    const look = DT_LOOK[3]!;
    this.glows.push({
      x: e.x,
      y: e.y,
      r: r * 0.8,
      start: e.tick,
      dur: 16,
      color: look[0],
      strength: 1.1 * k,
    });
    this.glows.push({
      x: e.x,
      y: e.y,
      r: r * 0.35,
      start: e.tick,
      dur: 20,
      color: 0xf4fbff,
      strength: 1.3 * k,
    });
    this.tintSky(look, 0.7 * k);
    this.split = Math.max(this.split, 1.5 * k);
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick + 4,
      dur: 40,
      maxR: r * 1.6,
      width: 10,
      strength: 0.8 * k,
    });
    this.kick(3 + r / 25, e.tick);
    const rng = this.rngFor(e, 53);
    // starburst: jagged ice spikes shooting out of the impact, upward-biased (the ground stops the rest)
    const pts: number[] = [];
    const spikes = 11;
    for (let s = 0; s < spikes; s++) {
      const a = (-0.12 + (1.24 * (s + rng.range(0.15, 0.85))) / spikes) * Math.PI;
      const len = r * rng.range(0.45, 0.95);
      let x = e.x;
      let y = e.y;
      const steps = 4;
      for (let j = 1; j <= steps; j++) {
        const d = (len * j) / steps;
        const jit = (len / 14) * (j < steps ? 1 : 0);
        const nx = Math.round(e.x + Math.cos(a) * d + rng.range(-jit, jit));
        const ny = Math.round(e.y - Math.sin(a) * d + rng.range(-jit, jit));
        line(x, y, nx, ny, pts);
        x = nx;
        y = ny;
      }
    }
    this.crystals.push({
      cells: Int32Array.from(pts),
      x: e.x,
      y: e.y,
      len: r,
      start: e.tick,
      dur: 28,
    });
    // shards of ice and glints
    const n = Math.round((90 + r) * this.mult);
    const fast = 1.6 + r / 28;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0.04, 0.96) * Math.PI;
      const s = rng.range(0.3, 1) * fast;
      const glint = i % 3 === 0;
      this.particles.add({
        x: e.x + rng.range(-3, 3),
        y: e.y + rng.range(-3, 2),
        vx: Math.cos(a) * s * 1.15,
        vy: -Math.sin(a) * s,
        life: rng.range(30, 70),
        size: glint ? 1 : rng.range(1, 2.4),
        color: ICE[Math.floor(rng.next() * (glint ? 2 : ICE.length))]!,
        kind: glint ? PKind.Spark : PKind.Chunk,
      });
    }
    // a freezing cloud rolling out of the crater
    const nMist = Math.round((10 + r / 4) * Math.max(0.5, this.mult));
    for (let i = 0; i < nMist; i++) {
      this.particles.add({
        x: e.x + rng.range(-r, r) * 0.35,
        y: e.y + rng.range(-r, r) * 0.15,
        vx: rng.range(-0.6, 0.6),
        vy: -rng.range(0.02, 0.3),
        life: rng.range(70, 130),
        size: rng.range(r * 0.15, r * 0.3),
        color: i % 2 === 0 ? 0xdcefff : 0xb4d8f2,
        kind: PKind.Smoke,
      });
    }
    // snow drifting down over the frozen ground for a few seconds
    const nSnow = Math.round((60 + r * 1.2) * this.mult);
    for (let i = 0; i < nSnow; i++) {
      this.particles.add({
        x: e.x + rng.range(-1.3, 1.3) * r,
        y: e.y - rng.range(0.2, 1.8) * r,
        vx: rng.range(-0.1, 0.1),
        vy: rng.range(0, 0.15),
        life: rng.range(140, 260),
        size: 1,
        color: rng.next() < 0.7 ? 0xffffff : 0xd6ecfa,
        kind: PKind.Snow,
      });
    }
  }

  /**
   * A fissure ripping open (Fault Line): a jolt, a lens kick through the ground, and a geyser of
   * dust and clods out of the crack mouth; a magma crack also throws up a spray of embers.
   */
  /** The ground giving way: a hard jolt, air blasting dust out of the rim cracks, grit raining in. */
  private sinkhole(e: EffectEvent): void {
    const rng = this.rngFor(e, 53);
    const R = Math.max(8, e.radius);
    const depth = Math.max(8, e.params.depth ?? 40);
    this.kick(8, e.tick);
    this.ripples.push({
      x: e.x,
      y: e.y + depth * 0.5,
      start: e.tick,
      dur: 26,
      maxR: R * 1.8,
      width: 10,
      strength: 0.9,
    });
    // air pushed out of the cavern blasts up through the cracks at the rim
    for (let side = -1; side <= 1; side += 2) {
      const x0 = Math.round(e.x + side * R);
      const y0 = this.surfaceNear(x0, e.y, 60);
      if (y0 < 0) continue;
      const col = this.dustColor(x0, y0 + 2);
      const n = Math.round(22 * this.mult) + 3;
      for (let i = 0; i < n; i++) {
        this.particles.add({
          x: x0 + rng.range(-3, 3),
          y: y0 - rng.range(0, 3),
          vx: side * rng.range(-0.1, 0.5),
          vy: -rng.range(0.6, 2.2),
          life: rng.range(24, 50),
          size: rng.range(2, 5),
          color: shade(col, rng.range(0.85, 1.2)),
          kind: PKind.Dust,
        });
      }
    }
    // clods breaking off the lip and dropping in
    const nChunk = Math.round(36 * this.mult) + 4;
    for (let i = 0; i < nChunk; i++) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const x = Math.round(e.x + side * R * rng.range(0.7, 1.05));
      const y = this.surfaceNear(x, e.y, 60);
      if (y < 0) continue;
      this.particles.add({
        x,
        y: y - 1,
        vx: -side * rng.range(0.1, 0.9),
        vy: rng.range(-0.8, 0.2),
        life: rng.range(30, 60),
        size: rng.range(1, 2),
        color: shade(this.dustColor(x, y + 2), rng.range(0.7, 1.05)),
        kind: PKind.Chunk,
      });
    }
  }

  /**
   * Dust over a sinkhole: while it sags, thin puffs wheeze out of cracks across the doomed ground;
   * with `plume`, a wide brown cloud rolls up out of the finished pit.
   */
  private sinkholeDust(e: EffectEvent): void {
    const rng = this.rngFor(e, 59);
    const R = Math.max(8, e.radius);
    const plume = (e.params.plume ?? 0) > 0;
    const n = Math.round((plume ? 70 : 10) * this.mult) + 2;
    for (let i = 0; i < n; i++) {
      const x = Math.round(e.x + rng.range(-R, R) * (plume ? 0.8 : 1));
      const y = this.surfaceNear(x, e.y, plume ? 120 : 30);
      if (y < 0) continue;
      this.particles.add({
        x,
        y: y - rng.range(1, plume ? 10 : 2),
        vx: rng.range(-0.3, 0.3),
        vy: -rng.range(0.1, plume ? 1.3 : 0.5),
        life: rng.range(plume ? 40 : 18, plume ? 90 : 36),
        size: rng.range(plume ? 3 : 1, plume ? 6 : 3),
        color: shade(this.dustColor(x, y + 1), rng.range(0.85, 1.15)),
        kind: PKind.Dust,
      });
    }
  }

  private rift(e: EffectEvent): void {
    const rng = this.rngFor(e, 43);
    const depth = Math.max(8, e.radius);
    const w = Math.max(1, e.params.width ?? 3);
    const hot = (e.params.hot ?? 0) > 0;
    this.kick(hot ? 9 : 6, e.tick);
    this.ripples.push({
      x: e.x,
      y: e.y + depth * 0.4,
      start: e.tick,
      dur: 30,
      maxR: depth * 1.6,
      width: 10,
      strength: hot ? 1.1 : 0.8,
    });
    this.fronts.push({
      x: e.x,
      y: e.y,
      maxR: depth * 0.9,
      start: e.tick,
      dur: 18,
      rng: this.rngFor(e, 47),
    });
    this.tintSky(DT_LOOK[5]!, hot ? 0.3 : 0.18);
    const col = this.dustColor(e.x, e.y + 4);
    // the geyser: a tall narrow column of dust, then clods thrown up and out
    const nDust = Math.round((26 + depth / 2) * this.mult) + 4;
    for (let i = 0; i < nDust; i++) {
      this.particles.add({
        x: e.x + rng.range(-w, w),
        y: e.y - rng.range(0, 4),
        vx: rng.range(-0.25, 0.25),
        vy: -rng.range(0.6, 2.6) * (0.6 + depth / 120),
        life: rng.range(30, 70),
        size: rng.range(2.5, 6),
        color: shade(col, rng.range(0.85, 1.25)),
        kind: PKind.Dust,
      });
    }
    const nChunk = Math.round((30 + depth / 2) * this.mult) + 4;
    for (let i = 0; i < nChunk; i++) {
      const side = rng.next() < 0.5 ? -1 : 1;
      this.particles.add({
        x: e.x + rng.range(-w, w) * 0.5,
        y: e.y - 1,
        vx: side * rng.range(0.1, 1.4),
        vy: -rng.range(1.2, 3.8),
        life: rng.range(40, 80),
        size: rng.range(1, 2),
        color: shade(col, rng.range(0.7, 1.1)),
        kind: PKind.Chunk,
      });
    }
    if (!hot) return;
    const nSpark = Math.round(40 * this.mult) + 6;
    for (let i = 0; i < nSpark; i++) {
      this.particles.add({
        x: e.x + rng.range(-w, w) * 0.5,
        y: e.y + rng.range(0, 3),
        vx: rng.range(-0.8, 0.8),
        vy: -rng.range(1.5, 4.2),
        life: rng.range(24, 60),
        size: 1,
        color: rng.next() < 0.35 ? 0xffe070 : rng.next() < 0.6 ? 0xff7a1a : 0xe8401a,
        kind: PKind.Spark,
      });
    }
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 6 + w,
      start: e.tick,
      dur: 12,
      color: 0xff7a24,
      strength: 1,
    });
  }

  /**
   * A mud geyser blowing: the ground heaves (distortion ring, dust front, brown sky), then a
   * column of mud chunks and steam roars up out of the vent for `ticks` ticks (fed in `tick`).
   */
  private mudGeyser(e: EffectEvent): void {
    const h = e.params.height ?? 120;
    const dur = Math.max(20, e.params.ticks ?? 90);
    this.jets.push({ x: e.x, y: e.y, height: h, start: e.tick, dur, rng: this.rngFor(e, 101) });
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 40,
      maxR: h * 0.9,
      width: 14,
      strength: 0.9,
    });
    this.fronts.push({
      x: e.x,
      y: e.y,
      maxR: h * 0.55,
      start: e.tick,
      dur: 30,
      rng: this.rngFor(e, 103),
    });
    this.kick(5, e.tick);
    this.tintSky([0, 0.34, 0.27, 0.16], 0.45);
    // the first slug of mud: a fat burst straight up out of the vent
    const rng = this.rngFor(e, 107);
    const v0 = Math.sqrt(2 * 0.12 * h);
    const n = Math.round(140 * this.mult) + 6;
    for (let i = 0; i < n; i++) {
      const up = rng.range(0.45, 1.08) * v0;
      this.particles.add({
        x: e.x + rng.range(-5, 5),
        y: e.y - rng.range(0, 3),
        vx: rng.range(-0.7, 0.7),
        vy: -up,
        // gone as it falls back to the vent's level (particles don't hit the ground)
        life: (2 * up) / 0.12 + rng.range(0, 4),
        size: rng.next() < 0.5 ? 2 : 1,
        color: MUD[Math.floor(rng.next() * 4)]!,
        kind: PKind.Chunk,
      });
    }
  }

  /** One tick of every live geyser column. */
  private feedJets(t: number): void {
    this.jets = this.jets.filter((j) => {
      const age = t - j.start;
      if (age > j.dur) return false;
      if (age < 0) return true;
      const k = age / j.dur;
      // full roar, then sputtering down over the last half
      const power = k < 0.45 ? 1 : Math.max(0.15, 1 - (k - 0.45) / 0.55);
      const sputter = k > 0.6 && j.rng.next() < 0.35 ? 0.3 : 1;
      const v0 = Math.sqrt(2 * 0.12 * j.height) * Math.sqrt(power) * sputter;
      const rng = j.rng;
      const n = Math.round(32 * power * this.mult) + 1;
      for (let i = 0; i < n; i++) {
        // the core of the column is tight; the skin of it peels off wider
        const skin = i % 4 === 0;
        const up = v0 * rng.range(skin ? 0.5 : 0.82, 1.02);
        this.particles.add({
          x: j.x + rng.range(-4.5, 4.5),
          y: j.y - rng.range(0, 2),
          vx: skin ? rng.range(-0.7, 0.7) : rng.range(-0.24, 0.24),
          vy: -up,
          life: (2 * up) / 0.12 + rng.range(0, 4),
          size: skin ? 1 : rng.next() < 0.6 ? 2 : 3,
          color: MUD[rng.next() < 0.12 ? 3 : Math.floor(rng.next() * 3)]!,
          kind: PKind.Chunk,
        });
      }
      // steam boiling off the column all the way up, thickest near the top
      const hNow = j.height * power * sputter;
      const ns = Math.round(1.5 * power * this.mult) + (age % 3 === 0 ? 1 : 0);
      for (let i = 0; i < ns; i++) {
        const along = 0.55 + 0.45 * rng.next();
        this.particles.add({
          x: j.x + rng.range(-4, 4) * (0.5 + along),
          y: j.y - along * hNow,
          vx: rng.range(-0.3, 0.3),
          vy: -rng.range(0.2, 0.9),
          life: rng.range(50, 100),
          size: rng.range(3, 6),
          color: STEAM[Math.floor(rng.next() * 3)]!,
          kind: PKind.Smoke,
        });
      }
      // mud boiling over the lip of the vent
      if (age % 3 === 0) {
        for (const side of [-1, 1]) {
          this.particles.add({
            x: j.x + side * rng.range(2, 5),
            y: j.y - 1,
            vx: side * rng.range(0.4, 1.4),
            vy: -rng.range(0.6, 1.6),
            life: 40,
            size: 1,
            color: MUD[1 + Math.floor(rng.next() * 2)]!,
            kind: PKind.Chunk,
          });
        }
      }
      return true;
    });
  }

  /** A glob of mud landing: a wet crown of mud thrown sideways and a puff of steam. */
  private mudSplat(e: EffectEvent, count: number): void {
    const rng = this.rngFor(e, 109);
    const n = Math.round(count * this.mult) + 3;
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.particles.add({
        x: e.x + side * rng.range(0, 2),
        y: e.y - 1,
        vx: side * rng.range(0.3, 1.3),
        vy: -rng.range(0.5, 1.8),
        life: rng.range(25, 45),
        size: 1,
        color: MUD[Math.floor(rng.next() * 4)]!,
        kind: PKind.Chunk,
      });
    }
    for (let i = 0; i < 2; i++) {
      this.particles.add({
        x: e.x + rng.range(-2, 2),
        y: e.y - 2,
        vx: rng.range(-0.2, 0.2),
        vy: -rng.range(0.2, 0.5),
        life: rng.range(30, 50),
        size: rng.range(2, 4),
        color: STEAM[1]!,
        kind: PKind.Smoke,
      });
    }
  }

  /**
   * A Glue Bomb bursting: a dome of glue swells and wobbles at the impact, strings of glue fly out
   * with gobs on their ends and stick where they land, and a crown of goo spatters around.
   */
  private glueSplat(e: EffectEvent): void {
    const rng = this.rngFor(e, 131);
    const k = e.params.strength ?? 1;
    // the dome sits on the ground under the burst (a hit on a tank bursts above it)
    const gy = this.surfaceNear(Math.round(e.x), Math.round(e.y), 24);
    this.splats.push({ x: e.x, y: gy >= 0 ? gy : e.y, r: 10 * k, start: e.tick, dur: 90 });
    const n = Math.round(9 * this.mult * k) + 5;
    for (let i = 0; i < n; i++) {
      // fan out over the upper half, both sides
      const a = Math.PI * (0.08 + 0.84 * ((i + rng.next()) / n));
      const v = rng.range(1.1, 2.6) * Math.sqrt(k);
      this.strands.push({
        ax: e.x + rng.range(-3, 3),
        ay: e.y - rng.range(1, 5),
        hx: e.x,
        hy: e.y - 2,
        vx: Math.cos(a) * v,
        vy: -Math.sin(a) * v,
        start: e.tick,
        life: Math.round(rng.range(24, 60)),
        stuck: false,
      });
    }
    const m = Math.round(46 * this.mult * k) + 6;
    for (let i = 0; i < m; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.particles.add({
        x: e.x + side * rng.range(0, 4),
        y: e.y - rng.range(1, 4),
        vx: side * rng.range(0.2, 1.8),
        vy: -rng.range(0.6, 2.6),
        life: rng.range(30, 60),
        size: rng.next() < 0.3 ? 2 : 1,
        color: GLUE[Math.floor(rng.next() * 4)]!,
        kind: PKind.Chunk,
      });
    }
    this.kick(2, e.tick);
  }

  /** A tank gummed up: goo slaps onto it, and strings stretch from the hull down to the ground. */
  private glued(e: EffectEvent): void {
    const rng = this.rngFor(e, 137);
    const half = Math.max(4, e.radius);
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1;
      this.strands.push({
        ax: e.x + side * rng.range(2, half),
        ay: e.y - rng.range(3, 7),
        hx: e.x + side * half,
        hy: e.y - 4,
        vx: side * rng.range(0.3, 0.9),
        vy: rng.range(0, 0.4),
        start: e.tick,
        life: Math.round(rng.range(40, 70)),
        stuck: false,
      });
    }
    const n = Math.round(18 * this.mult) + 4;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: e.x + rng.range(-half, half),
        y: e.y - rng.range(2, 9),
        vx: rng.range(-0.6, 0.6),
        vy: -rng.range(0.2, 1.2),
        life: rng.range(16, 30),
        size: 1,
        color: GLUE[Math.floor(rng.next() * 3)]!,
        kind: PKind.Chunk,
      });
    }
  }

  /** The glue lets go: strings from the hull to the ground stretch up and snap. */
  private unglued(e: EffectEvent): void {
    const rng = this.rngFor(e, 139);
    const half = Math.max(4, e.radius);
    for (let i = 0; i < 6; i++) {
      const x = e.x + rng.range(-half - 2, half + 2);
      this.strands.push({
        ax: x,
        ay: e.y,
        hx: x,
        hy: e.y - 3,
        vx: rng.range(-0.2, 0.2),
        vy: -rng.range(0.4, 0.9),
        start: e.tick,
        life: Math.round(rng.range(8, 16)),
        stuck: true,
      });
    }
  }

  /** Move glue string heads (gravity, sticking on terrain); snap strings whose time is up. */
  private tickStrands(t: number): void {
    if (this.strands.length === 0) return;
    const keep: Strand[] = [];
    for (const s of this.strands) {
      const age = t - s.start;
      if (age > s.life) {
        // snap: the two halves fall away as gobs
        const mx = (s.ax + s.hx) / 2;
        const my = (s.ay + s.hy) / 2;
        for (let i = 0; i < 2; i++) {
          this.particles.add({
            x: i === 0 ? mx : s.hx,
            y: i === 0 ? my : s.hy,
            vx: (i === 0 ? -0.2 : 0.2) + s.vx * 0.1,
            vy: 0.2,
            life: 26,
            size: 1,
            color: GLUE[2]!,
            kind: PKind.Chunk,
          });
        }
        continue;
      }
      if (s.stuck) {
        // an unsticking string keeps rising (it is being pulled off), a landed one stays put
        if (s.vy < 0) {
          s.hx += s.vx;
          s.hy += s.vy;
        }
      } else if (age >= 0) {
        s.vy += 0.1;
        const nx = s.hx + s.vx;
        const ny = s.hy + s.vy;
        const p = this.probe;
        const cx = Math.floor(nx);
        const cy = Math.floor(ny);
        if (cx < 0 || cx >= p.width || cy >= p.height) {
          s.stuck = true;
          s.vy = 0;
        } else if (cy >= 0 && p.material(cx, cy) !== 0) {
          s.stuck = true;
          s.vy = 0;
        } else {
          s.hx = nx;
          s.hy = ny;
        }
      }
      keep.push(s);
    }
    this.strands = keep;
    this.splats = this.splats.filter((s) => t - s.start <= s.dur);
  }

  /** Update (or start) the tornado an event belongs to: one event per tornado per tick. */
  private tornado(e: EffectEvent): void {
    const pr = e.params;
    let f: Funnel | undefined;
    for (const g of this.funnels) {
      if (e.tick - g.last <= 3 && Math.abs(g.x - e.x) <= 12) {
        f = g;
        break;
      }
    }
    if (!f) {
      f = makeFunnel(this.rngFor(e, 59).next() * 4294967296, e.tick);
      this.funnels.push(f);
    }
    f.x = e.x;
    f.y = e.y;
    f.h = e.radius;
    f.base = pr.base ?? 4;
    f.top = pr.top ?? 30;
    f.lean = pr.lean ?? 0;
    f.wobble = pr.wobble ?? 0;
    f.age = pr.age ?? 0;
    f.strength = (pr.strength ?? 0) / 100;
    f.down = (pr.down ?? 100) / 100;
    f.last = e.tick;
    if ((e.tick & 7) === 0) f.dust = this.dustColor(e.x, e.y + 2);
  }

  /** Update (or start) the magnet mine an event belongs to: one event per mine per tick. */
  private magnet(e: EffectEvent): void {
    const pr = e.params;
    let m: MagnetFx | undefined;
    for (const g of this.magnets) {
      if (e.tick - g.last <= 3 && g.x === e.x && g.y === e.y) {
        m = g;
        break;
      }
    }
    if (!m) {
      m = { x: e.x, y: e.y, r: e.radius, age: 0, arm: 0, life: 0, strength: 0, last: e.tick };
      this.magnets.push(m);
    }
    m.r = e.radius;
    m.age = pr.age ?? 0;
    m.arm = pr.arm ?? 0;
    m.life = pr.life ?? 0;
    m.strength = (pr.strength ?? 0) / 100;
    m.last = e.tick;
  }

  /**
   * Warp (terrainop.warp): violet-cyan plasma wisps and single white pixels lift off a tank as it
   * breaks apart, rush in to where it comes out, or puff out where a warp fizzles.
   */
  private warpMotes(e: EffectEvent): void {
    const rng = this.rngFor(e, 41);
    const r = Math.max(4, e.radius);
    const inward = e.type === 'warpIn';
    const fizzle = e.type === 'warpFizzle';
    const n = Math.round((fizzle ? 8 : 18) * this.mult) + 3;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = inward ? rng.range(r + 6, r + 16) : rng.range(1, r);
      const ox = Math.cos(a) * d;
      const oy = Math.sin(a) * d * 0.7;
      const sp = rng.range(0.25, 0.7);
      this.particles.add({
        x: e.x + ox,
        y: e.y + oy,
        vx: inward ? (-ox / d) * sp * 1.6 : rng.range(-0.3, 0.3),
        vy: inward ? (-oy / d) * sp * 1.6 : -sp,
        life: rng.range(14, 28),
        size: rng.next() < 0.5 ? 1 : 3,
        color: PORTAL[Math.floor(rng.next() * PORTAL.length)]!,
        kind: PKind.Plasma,
      });
    }
    if (fizzle) return;
    // single white-hot pixels, the sharp edge of the jump
    const m = Math.round(10 * this.mult) + 2;
    for (let i = 0; i < m; i++) {
      this.particles.add({
        x: e.x + rng.range(-r, r),
        y: e.y + rng.range(-r * 0.6, r * 0.6),
        vx: rng.range(-0.8, 0.8),
        vy: -rng.range(0.6, 1.6),
        life: rng.range(10, 22),
        size: 1,
        color: rng.next() < 0.5 ? 0xffffff : 0x9ff0ff,
        kind: PKind.Glitter,
      });
    }
  }

  /** Update (or start) the gravity well an event belongs to: one event per well per tick. */
  private gravityWell(e: EffectEvent): void {
    const pr = e.params;
    let w: GravityFx | undefined;
    for (const g of this.wells) {
      if (e.tick - g.last <= 3 && g.x === e.x && g.y === e.y) {
        w = g;
        break;
      }
    }
    if (!w) {
      w = { x: e.x, y: e.y, r: e.radius, core: 6, strength: 0, age: 0, last: e.tick };
      this.wells.push(w);
    }
    w.r = e.radius;
    w.core = pr.core ?? 6;
    w.age = pr.age ?? 0;
    w.strength = (pr.strength ?? 0) / 256;
    w.last = e.tick;
    // space breathes: a faint lensing ripple rolls out of the well now and then
    if (w.strength >= 1 && w.age % 64 === 0) {
      this.ripples.push({
        x: e.x,
        y: e.y,
        start: e.tick,
        dur: 30,
        maxR: e.radius * 0.7,
        width: 6,
        strength: 0.3,
      });
    }
  }

  /** Update (or start) the star a `supernova` event belongs to; the sky warms as it grows. */
  private supernova(e: EffectEvent): void {
    const pr = e.params;
    let st: StarFx | undefined;
    for (const g of this.novas) if (e.tick - g.last <= 3 && g.x === e.x && g.y === e.y) st = g;
    if (!st) {
      st = { x: e.x, y: e.y, r: e.radius, t: 0, charge: 1, collapse: 0, last: e.tick };
      this.novas.push(st);
    }
    st.t = pr.t ?? 0;
    st.charge = pr.charge ?? 1;
    st.collapse = pr.collapse ?? 0;
    st.r = e.radius;
    st.last = e.tick;
    const burn = Math.max(1, st.charge - st.collapse);
    if (st.t <= burn) {
      const k = st.t / burn;
      this.tintSky([0, 0.55, 0.3, 0.05], 0.004 + 0.01 * k);
      if (st.t % 6 === 0) this.kick(0.5 + 2 * k, e.tick);
      // heat shimmer pulses off the star
      if (st.t % 20 === 0)
        this.ripples.push({
          x: e.x,
          y: e.y,
          start: e.tick,
          dur: 18,
          maxR: 20 + 40 * k,
          width: 5,
          strength: 0.25 + 0.3 * k,
        });
    } else {
      this.tintSky([0, 0.2, 0.35, 0.9], 0.03);
    }
  }

  /**
   * A Supernova goes off: a white-out flash, a hard ring of white → cyan → violet star-stuff
   * racing outward, and a huge distortion wave.
   */
  private supernovaBurst(e: EffectEvent): void {
    const rng = this.rngFor(e, 149);
    this.novas = this.novas.filter((s) => s.x !== e.x || s.y !== e.y);
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 70,
      start: e.tick,
      dur: 16,
      color: 0xffffff,
      strength: 1.4,
    });
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 30,
      start: e.tick,
      dur: 40,
      color: 0x80c8ff,
      strength: 1,
    });
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 40,
      maxR: e.radius * 1.9,
      width: 22,
      strength: 1.6,
    });
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick + 8,
      dur: 36,
      maxR: e.radius * 1.3,
      width: 12,
      strength: 0.9,
    });
    this.tintSky([0, 1, 1, 1], 0.7);
    this.kick(9, e.tick);
    const n = Math.round(220 * this.mult) + 60;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.02, 0.02);
      const sp = rng.range(3.2, 4.6);
      const tone = rng.next();
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.85,
        life: rng.range(22, 40),
        size: 1,
        color: tone < 0.3 ? 0xffffff : tone < 0.65 ? 0x80e8ff : 0xb070ff,
        kind: PKind.Glitter,
      });
    }
    const m = Math.round(90 * this.mult) + 20;
    for (let i = 0; i < m; i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = rng.range(0.8, 2.6);
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(30, 60),
        size: 1,
        color: rng.next() < 0.5 ? 0x80c8ff : 0xb070ff,
        kind: PKind.Plasma,
      });
    }
  }

  /** Update (or start) the portal pair an event belongs to, and shed a few wisps off its rims. */
  private portal(e: EffectEvent): void {
    const pr = e.params;
    let p: PortalFx | undefined;
    for (const g of this.portals) {
      if (e.tick - g.last <= 4 && g.ax === e.x && g.ay === e.y) {
        p = g;
        break;
      }
    }
    if (!p) {
      p = {
        ax: e.x,
        ay: e.y,
        bx: 0,
        by: 0,
        rx: 8,
        ry: e.radius,
        age: 0,
        open: 1,
        shut: -1,
        close: 1,
        left: 0,
        last: e.tick,
      };
      this.portals.push(p);
    }
    p.bx = pr.bx ?? e.x;
    p.by = pr.by ?? e.y;
    p.rx = pr.rx ?? 8;
    p.ry = e.radius;
    p.age = pr.age ?? 0;
    p.open = pr.open ?? 1;
    p.shut = pr.shut ?? -1;
    p.close = pr.close ?? 1;
    p.left = pr.left ?? 0;
    p.last = e.tick;
    if (p.shut >= 0 || p.age < p.open * 0.5) return;
    const rng = this.rngFor(e, 59);
    for (let k = 0; k < 2; k++) {
      if (rng.next() > 0.35 * this.mult) continue;
      const [cx, cy, pal] = k === 0 ? [p.ax, p.ay, RING_A] : [p.bx, p.by, RING_B];
      const a = rng.range(0, Math.PI * 2);
      this.particles.add({
        x: cx + Math.cos(a) * (p.rx + 1),
        y: cy + Math.sin(a) * (p.ry + 1),
        vx: Math.cos(a) * 0.25,
        vy: Math.sin(a) * 0.25 - 0.1,
        life: rng.range(12, 24),
        size: 1,
        color: pal[1 + Math.floor(rng.next() * 3)]!,
        kind: PKind.Plasma,
      });
    }
  }

  /** Update (or start) the rogue black hole an event belongs to; it sheds dust as it eats. */
  private rogueHole(e: EffectEvent): void {
    const pr = e.params;
    let h: GravityFx | undefined;
    for (const g of this.holes) {
      if (e.tick - g.last <= 3 && Math.abs(g.x - e.x) <= 4 && Math.abs(g.y - e.y) <= 4) h = g;
    }
    if (!h) {
      h = { x: e.x, y: e.y, r: e.radius, core: 10, strength: 0, age: 0, last: e.tick };
      this.holes.push(h);
    }
    h.x = e.x;
    h.y = e.y;
    h.r = e.radius;
    h.core = pr.core ?? 10;
    h.age = pr.age ?? 0;
    h.strength = (pr.strength ?? 0) / 256;
    h.last = e.tick;
    // ground torn off the rim streaks into the hole while it moves
    if ((pr.moving ?? 0) > 0) {
      const rng = this.rngFor(e, 163);
      const n = Math.round(6 * this.mult) + 2;
      const rim = h.core + 2;
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const rr = rim + rng.range(2, 14);
        const x = Math.round(e.x + Math.cos(a) * rr);
        const y = Math.round(e.y + Math.sin(a) * rr);
        const m = this.probe.material(x, y);
        if (m === 0) continue;
        const life = rng.range(5, 10);
        this.particles.add({
          x,
          y,
          vx: (e.x - x) / life,
          vy: (e.y - y) / life,
          life,
          size: 1,
          color: this.probe.color(m),
          kind: PKind.Spark,
        });
      }
      if (h.age % 8 === 0) this.kick(1, e.tick);
    }
  }

  /** A rogue black hole bites a tank: sparks torn off its hull into the hole, a hard jolt. */
  private holeBite(e: EffectEvent): void {
    let cx = e.x;
    let cy = e.y;
    for (const g of this.holes)
      if (Math.abs(g.x - e.x) <= g.r && Math.abs(g.y - e.y) <= g.r) ({ x: cx, y: cy } = g);
    const rng = this.rngFor(e, 167);
    const n = Math.round(18 * this.mult) + 6;
    for (let i = 0; i < n; i++) {
      const x = e.x + rng.range(-e.radius, e.radius);
      const y = e.y + rng.range(-3, 3);
      const life = rng.range(5, 10);
      this.particles.add({
        x,
        y,
        vx: (cx - x) / life,
        vy: (cy - y) / life,
        life,
        size: 1,
        color: rng.next() < 0.5 ? 0xffffff : 0xffa040,
        kind: PKind.Spark,
      });
    }
    this.kick(3, e.tick);
  }

  /**
   * A shell swallowed by a gravity well: it stretches into a streak of sparks that snap into the
   * core, a white pop on the photon ring, and a lensing ripple rolls out.
   */
  private wellSwallow(e: EffectEvent): void {
    let cx = e.x;
    let cy = e.y;
    for (const g of this.wells) {
      if (Math.abs(g.x - e.x) <= g.r && Math.abs(g.y - e.y) <= g.r) {
        cx = g.x;
        cy = g.y;
      }
    }
    const rng = this.rngFor(e, 137);
    const n = Math.round(24 * this.mult) + 8;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = rng.range(2, 9);
      const life = rng.range(4, 9);
      const x = Math.round(cx + Math.cos(a) * rr);
      const y = Math.round(cy + Math.sin(a) * rr);
      this.particles.add({
        x,
        y,
        vx: (cx - x) / life,
        vy: (cy - y) / life,
        life,
        size: 1,
        color: rng.next() < 0.4 ? 0xffffff : rng.next() < 0.5 ? 0xffa040 : 0xb070ff,
        kind: PKind.Spark,
      });
    }
    this.glows.push({ x: cx, y: cy, r: 8, start: e.tick, dur: 8, color: 0xffffff, strength: 1 });
    this.ripples.push({
      x: cx,
      y: cy,
      start: e.tick + 2,
      dur: 22,
      maxR: 60,
      width: 8,
      strength: 0.8,
    });
    this.kick(2, e.tick);
  }

  /** A puff of ring-coloured wisps and white pixels (a ring opening, shutting, or something going through). */
  private portalBurst(
    x: number,
    y: number,
    r: number,
    pal: readonly number[],
    e: EffectEvent,
  ): void {
    const rng = this.rngFor(e, Math.round(x * 7 + y));
    const n = Math.round(12 * this.mult) + 2;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = rng.range(0.3, 1.1);
      this.particles.add({
        x: x + Math.cos(a) * r * 0.5,
        y: y + Math.sin(a) * r,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(10, 22),
        size: 1,
        color: i % 3 === 0 ? 0xffffff : pal[1 + Math.floor(rng.next() * 3)]!,
        kind: i % 3 === 0 ? PKind.Glitter : PKind.Plasma,
      });
    }
  }

  drawPortals(normal: QuadBatch, t: number): void {
    for (const p of this.portals) drawPortal(normal, p, t);
  }

  /** Update (or start) the kaiju an event belongs to: one event per monster per tick. */
  private kaiju(e: EffectEvent): void {
    const pr = e.params;
    let k: KaijuFx | undefined;
    for (const g of this.kaijus) {
      if (e.tick - g.last <= 4 && g.x === e.x) {
        k = g;
        break;
      }
    }
    if (!k) {
      k = {
        x: e.x,
        y: e.y,
        h: e.radius,
        state: 0,
        t: 0,
        rise: 1,
        sink: 1,
        topple: 40,
        reach: 16,
        face: 1,
        hx: e.x,
        hy: e.y,
        held: 0,
        left: 0,
        age: 0,
        last: e.tick,
      };
      this.kaijus.push(k);
    }
    k.y = e.y;
    k.h = e.radius;
    k.state = pr.state ?? 1;
    k.t = pr.t ?? 0;
    k.rise = pr.rise ?? 1;
    k.sink = pr.sink ?? 1;
    k.topple = pr.topple ?? 40;
    k.reach = pr.reach ?? 16;
    k.face = pr.face ?? 1;
    k.hx = pr.hx ?? e.x;
    k.hy = pr.hy ?? e.y;
    k.held = pr.held ?? 0;
    k.left = pr.left ?? 0;
    k.age = pr.age ?? 0;
    k.last = e.tick;
    const rng = this.rngFor(e, 89);
    const up = kaijuEmerged(k);
    if (k.state === KAIJU_STATES.RISE && up > 0 && up < 1) {
      // earth heaving up round it, and clods sliding off its body as it climbs out
      this.dirtPop({ ...e, x: e.x + rng.range(-30, 30) }, 2);
      const col = this.dustColor(e.x, e.y + 2);
      const topY = e.y - up * e.radius;
      const n = Math.round(4 * this.mult) + 1;
      for (let i = 0; i < n; i++) {
        this.particles.add({
          x: e.x + rng.range(-36, 30),
          y: topY + rng.range(0, up * e.radius),
          vx: rng.range(-0.6, 0.6),
          vy: rng.range(0, 0.8),
          life: rng.range(14, 30),
          size: 1,
          color: shade(col, rng.range(0.6, 1.1)),
          kind: PKind.Chunk,
        });
      }
    }
    if (k.state === KAIJU_STATES.TOPPLE) {
      // its body slams into the ground: a long dust sheet along it and a hard jolt
      const tp = toppleAngle(k, this.probe);
      if (tp.landed && tp.since === 0) {
        this.kick(7, e.tick);
        const n = 7;
        for (let i = 0; i <= n; i++) {
          const x = Math.round(e.x + ((tp.tipX - e.x) * i) / n);
          const y = Math.round(e.y + ((tp.tipY - e.y) * i) / n);
          this.dirtPop({ ...e, x, y }, 10);
        }
        this.ripples.push({
          x: tp.tipX,
          y: tp.tipY,
          start: e.tick,
          dur: 26,
          maxR: 70,
          width: 10,
          strength: 0.8,
        });
      }
    }
    // mud drips off its body now and then (more as its time runs out)
    const every = k.left <= 1 ? 3 : 9;
    if (e.tick % every === 0 && k.state !== KAIJU_STATES.SINK) {
      const col = this.dustColor(e.x, e.y + 2);
      this.particles.add({
        x: e.x + rng.range(-12, 12),
        y: e.y - rng.range(10, e.radius * 0.8),
        vx: rng.range(-0.1, 0.1),
        vy: rng.range(0.2, 0.6),
        life: rng.range(14, 28),
        size: 1,
        color: shade(col, rng.range(0.5, 0.8)),
        kind: PKind.Chunk,
      });
    }
  }

  /**
   * It hit the ground and burst: the body is gone (no more events), torn into clods of its own
   * mud-and-scale colours and a spray of embers from its back, over a ground blast.
   */
  private kaijuBlast(e: EffectEvent): void {
    this.kaijus = this.kaijus.filter((k) => Math.abs(k.x - e.x) > e.radius * 2);
    const rng = this.rngFor(e, 131);
    const f = (e.params.dir ?? 1) >= 0 ? 1 : -1;
    const body = [0x6b4a2c, 0x8a6238, 0xa47a46, 0x4e3420, 0x5d6b2a];
    const n = Math.round(260 * this.mult) + 30;
    for (let i = 0; i < n; i++) {
      // clods all along the fallen body, flung up and out
      const along = rng.range(-0.2, 1.1) * e.radius;
      this.particles.add({
        x: e.x - f * (e.radius * 0.45) + f * along,
        y: e.y - rng.range(1, 14),
        vx: rng.range(-2, 2),
        vy: rng.range(-4.2, -0.8),
        life: rng.range(40, 90),
        size: rng.next() < 0.45 ? 2 : 1,
        color: body[Math.floor(rng.next() * body.length) % body.length]!,
        kind: PKind.Chunk,
      });
    }
    const m = Math.round(40 * this.mult) + 6;
    for (let i = 0; i < m; i++) {
      // embers from the spines along its back
      this.particles.add({
        x: e.x - f * (e.radius * 0.45) + f * rng.range(0, 1) * e.radius,
        y: e.y - rng.range(4, 16),
        vx: rng.range(-1.4, 1.4),
        vy: rng.range(-2.6, -0.4),
        life: rng.range(16, 40),
        size: 1,
        color: rng.next() < 0.5 ? 0xe95d08 : rng.next() < 0.6 ? 0xa1200c : 0xf8c409,
        kind: PKind.Spark,
      });
    }
    for (let i = 0; i < 5; i++) {
      this.dirtPop(
        { ...e, x: Math.round(e.x - f * (e.radius * 0.45) + f * (i / 4) * e.radius) },
        30,
      );
    }
    this.kick(9, e.tick);
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 36,
      maxR: e.radius * 2.2,
      width: 16,
      strength: 1,
    });
    this.tintSky([0, 0.45, 0.2, 0.05], 0.35);
  }

  /** A shell snatched out of the air: a hard burst of ember sparks at the hand. */
  private catchSparks(e: EffectEvent): void {
    const rng = this.rngFor(e, 97);
    const n = Math.round(16 * this.mult) + 2;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = rng.range(0.4, 1.8);
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.3,
        life: rng.range(8, 20),
        size: 1,
        color: rng.next() < 0.5 ? 0xffb43c : 0xffffff,
        kind: PKind.Spark,
      });
    }
  }

  /** Kaiju monsters, drawn behind tanks (so a tank in its hand shows in front). */
  drawKaijus(normal: QuadBatch, additive: QuadBatch, t: number): void {
    for (const k of this.kaijus) drawKaiju(k, normal, additive, t, this.probe);
  }

  /** Swirl lenses round black holes this frame (the post pass twists the image round them). */
  swirls(t: number): { x: number; y: number; r: number; strength: number; twist: number }[] {
    const out: { x: number; y: number; r: number; strength: number; twist: number }[] = [];
    for (const w of this.wells) {
      if (t - w.last > 2 || w.strength <= 0) continue;
      out.push({ x: w.x, y: w.y, r: w.core + 30, strength: w.strength, twist: 2.4 });
    }
    for (const h of this.holes) {
      if (t - h.last > 3 || h.strength <= 0) continue;
      out.push({ x: h.x, y: h.y, r: h.core + 36, strength: h.strength, twist: -2.8 });
    }
    return out;
  }

  /** Gravity wells. */
  drawGravity(normal: QuadBatch, additive: QuadBatch, t: number): void {
    for (const w of this.wells) drawWell(w, normal, additive, t, this.probe);
    for (const h of this.holes) drawWell(h, normal, additive, t, this.probe, true);
    for (const s of this.novas) drawStar(s, normal, additive, t, this.probe);
  }

  /** Magnet mines and their fields. */
  drawMagnets(normal: QuadBatch, additive: QuadBatch, t: number): void {
    for (const m of this.magnets) drawMagnet(m, normal, additive, t);
  }

  /** Dust skirt churned up round each tornado's base, once per tick. */
  private funnelDust(f: Funnel, t: number): void {
    if (f.down < 1 || f.strength <= 0.05 || t - f.last > 2) return;
    const n = Math.max(1, Math.round(4 * this.mult * f.strength));
    const rng = new FxRng((Math.imul(t + 1, 2654435761) ^ Math.imul(f.x + 11, 40503)) >>> 0);
    const w = funnelWidth(f, 0) + 3;
    for (let i = 0; i < n; i++) {
      const side = rng.next() < 0.5 ? -1 : 1;
      this.particles.add({
        x: f.x + side * rng.range(0, w),
        y: f.y - rng.range(0, 3),
        vx: side * rng.range(0.4, 1.6),
        vy: -rng.range(0.1, 0.9),
        life: rng.range(24, 50),
        size: rng.range(2.5, 5.5),
        color: shade(f.dust, rng.range(0.95, 1.2)),
        kind: PKind.Dust,
      });
    }
    // grit flicked out of the funnel wall
    if (rng.next() < 0.7 * this.mult) {
      const hh = rng.range(0, f.h * 0.8);
      const side = rng.next() < 0.5 ? -1 : 1;
      this.particles.add({
        x: f.x + side * (funnelWidth(f, hh) + 1),
        y: f.y - hh,
        vx: side * rng.range(0.8, 2.2),
        vy: -rng.range(0, 1),
        life: rng.range(30, 60),
        size: 1,
        color: shade(f.dust, rng.range(0.6, 1.1)),
        kind: PKind.Chunk,
      });
    }
  }

  /** A bumper kicks: a distortion punch out of the post, a jolt and a spray of pinball stars. */
  private bumpKick(e: EffectEvent): void {
    this.ripples.push({
      x: e.x,
      y: e.y - 8,
      start: e.tick,
      dur: 22,
      maxR: e.radius * 1.6,
      width: 10,
      strength: 0.9,
    });
    this.kick(4, e.tick);
    this.stars({ ...e, y: e.y - 12 }, 30, 2.2);
    this.tintSky([0, 0.45, 0.35, 0.1], 0.18);
  }

  /** Hard-coloured pixel stars thrown out of a point (bumper kicks, trails, bounces). */
  private stars(e: EffectEvent, count: number, speed: number): void {
    const rng = this.rngFor(e, 71);
    const n = Math.round(count * this.mult) + 1;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(0.3, 1) * speed;
      const c = rng.next();
      this.particles.add({
        x: e.x + rng.range(-1.5, 1.5),
        y: e.y + rng.range(-1.5, 1.5),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 0.3,
        life: rng.range(10, 26),
        size: 1,
        color: c < 0.4 ? 0xffe070 : c < 0.7 ? 0xffffff : c < 0.85 ? 0xff5a8c : 0x6ae0ff,
        kind: PKind.Spark,
      });
    }
  }

  /** Clods of the local ground kicked up (a bumper post breaking the surface, a tank kicked). */
  private dirtPop(e: EffectEvent, count: number): void {
    const rng = this.rngFor(e, 73);
    const n = Math.round(count * this.mult) + 1;
    const col = this.dustColor(e.x, e.y + 2);
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: e.x + rng.range(-6, 6),
        y: e.y - rng.range(0, 3),
        vx: rng.range(-1.1, 1.1),
        vy: -rng.range(0.5, 1.8),
        life: rng.range(18, 34),
        size: 1,
        color: shade(col, rng.range(0.7, 1.2)),
        kind: PKind.Chunk,
      });
    }
  }

  /** Bumper posts, drawn behind tanks and particles; sunk ones are dropped. */
  drawPosts(normal: QuadBatch, t: number): void {
    if (this.posts.length === 0) return;
    this.posts = this.posts.filter((p) => drawPost(p, normal, t));
  }

  /** Tornadoes, drawn behind particles and debris; stale ones are dropped. */
  drawFunnels(normal: QuadBatch, additive: QuadBatch, t: number): void {
    for (const f of this.funnels) drawFunnel(f, normal, additive, t);
  }

  /**
   * An Orbital Lance fires: the sky blazes white-orange, a distortion lens punches out from the
   * shaft mouth and the ground shakes; the beam itself is drawn by `lances`.
   */
  private lanceFire(e: EffectEvent): void {
    this.lances.fire(e, this.rngFor(e, 47));
    const surface = e.params.surface ?? e.y;
    this.tintSky([0, 0.7, 0.5, 0.3], 0.9);
    this.ripples.push({
      x: e.x + 0.5,
      y: surface,
      start: e.tick,
      dur: 40,
      maxR: 150,
      width: 18,
      strength: 1.1,
    });
    this.kick(5, e.tick);
  }

  /** Mushroom clouds, drawn over particles; finished ones are dropped. */
  drawMushrooms(normal: QuadBatch, additive: QuadBatch, t: number): void {
    if (this.mushrooms.length === 0) return;
    this.mushrooms = this.mushrooms.filter((m) => drawMushroom(m, normal, additive, t, false));
  }

  /** Strength 0..1 of the nuke sky whiteout at tick `t`. */
  whiteout(t: number): number {
    return whiteoutAt(t - this.whiteStart, this.whitePeak, this.whiteFade);
  }

  /** Add a coloured sky tint (§2a sky reaction); `amount` ~0.5 is a big flash. */
  tintSky(look: readonly [number, number, number, number], amount: number): void {
    const k = Math.min(0.5, amount);
    const s = this.sky;
    s[0] = Math.min(0.5, s[0] + look[1] * k);
    s[1] = Math.min(0.5, s[1] + look[2] * k);
    s[2] = Math.min(0.5, s[2] + look[3] * k);
    this.skyFlash = Math.max(s[0], s[1], s[2]);
  }

  /** A soft cloud of pixel puffs (zone spawns, zone damage). */
  private puff(e: EffectEvent, color: number, count: number): void {
    const rng = this.rngFor(e, 23);
    const n = Math.round(count * this.mult) + 2;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: e.x + rng.range(-e.radius, e.radius) * 0.7,
        y: e.y + rng.range(-e.radius, e.radius) * 0.5,
        vx: rng.range(-0.25, 0.25),
        vy: -rng.range(0, 0.25),
        life: rng.range(30, 60),
        size: rng.range(3, 6),
        color: shade(color, rng.range(0.8, 1.1)),
        kind: PKind.Dust,
      });
    }
  }

  /** Rust flakes (Thunderstorm): little orange-brown chips that flutter off a tank and drop. */
  private rustFlakes(e: EffectEvent, count: number): void {
    const rng = this.rngFor(e, 71);
    const n = Math.round(count * this.mult) + 2;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: e.x + rng.range(-e.radius, e.radius),
        y: e.y + rng.range(-3, 2),
        vx: rng.range(-0.35, 0.35),
        vy: -rng.range(0.1, 0.7),
        life: rng.range(20, 40),
        size: 1,
        color: RUST[Math.floor(rng.next() * 4)]!,
        kind: PKind.Chunk,
      });
    }
  }

  /**
   * A jagged lightning channel from the top of the map (or a storm cloud's base, `params.top`)
   * down to (x, y), with a branch or two.
   */
  private bolt(e: EffectEvent): void {
    const w = e.params.w ?? 1;
    this.skyBolt(
      e.x,
      e.y,
      e.tick,
      this.rngFor(e, 29),
      w,
      Math.round(20 * Math.min(2, w)),
      e.params.top ?? 0,
      e.params.storm === 1,
    );
    this.glows.push({
      x: e.x,
      y: e.y,
      r: Math.round(26 * w),
      start: e.tick,
      dur: 14,
      color: 0xc8d8ff,
      strength: 1.4,
    });
    // the whole sky blinks white-blue
    this.tintSky([0, 0.75, 0.8, 1], 0.5);
  }

  /**
   * One jagged channel from the top of the map down to (x, y) with a few branches, starting at
   * tick `start`; `w` scales its thickness.
   */
  private skyBolt(
    x: number,
    y: number,
    start: number,
    rng: FxRng,
    w: number,
    dur: number,
    from = 0,
    storm = false,
  ): void {
    const e = { x: Math.round(x), y: Math.max(1, Math.round(y)) };
    const pts: number[] = [];
    const walk = (x0: number, y0: number, y1: number, drift: number) => {
      let x = x0;
      let y = y0;
      while (y < y1) {
        const seg = Math.min(y1 - y, Math.round(rng.range(3, 9)));
        const nx = x + Math.round(rng.range(-3, 3) + drift);
        line(x, y, nx, y + seg, pts);
        x = nx;
        y += seg;
      }
      return x;
    };
    // aim the main channel so it lands on the target column
    const top = Math.max(0, Math.min(e.y - 1, Math.round(from)));
    walk(e.x + Math.round(rng.range(storm ? -8 : -18, storm ? 8 : 18)), top, e.y, 0);
    if (pts.length === 0) return;
    const fixX = e.x - pts[pts.length - 2]!;
    for (let i = 0; i < pts.length; i += 2) {
      const k = (pts[i + 1]! - top) / Math.max(1, e.y - top);
      pts[i] = pts[i]! + Math.round(fixX * k);
    }
    const main = pts.length;
    const branches = 4 + Math.floor(rng.next() * 3);
    for (let b = 0; b < branches; b++) {
      const at = 2 * Math.floor(rng.range(0.1, 0.85) * (main / 2));
      const bx = pts[at]!;
      const by = pts[at + 1]!;
      const end = walk(bx, by, by + Math.round(rng.range(14, 46)), rng.next() < 0.5 ? -1.6 : 1.6);
      // a sub-branch off some branches
      if (rng.next() < 0.5)
        walk(end, pts[pts.length - 1]!, pts[pts.length - 1]! + 10, rng.range(-2, 2));
    }
    this.bolts.push({
      cells: Int32Array.from(pts),
      main,
      start,
      dur,
      w,
      seed: rng.next() * 4294967296,
    });
  }

  /**
   * The Ion Cannon strike: the beam itself (ion.ts), the nuke's white sky, then instead of a
   * mushroom cloud a storm of fat electric bolts hammering the crater for seconds, arcs crawling
   * out along the ground, and a train of distortion shockwaves rolling out one after another.
   */
  private ionBlast(e: EffectEvent, k: number): void {
    const r = e.radius;
    const floor = this.craterFloor(Math.round(e.x), e.y, r);
    this.ions.fire(e, this.rngFor(e, 157), floor);
    const w = whiteoutFor(r * 0.6 * k);
    const now = this.whiteout(e.tick);
    this.whiteStart = e.tick;
    this.whitePeak = Math.max(w.peak, now);
    this.whiteFade = Math.max(w.fade, now > 0 ? this.whiteFade : 1);
    this.tintSky([0, 0.5, 0.7, 1], 0.5);
    this.split = Math.max(this.split, 4);
    this.kick(6 + r / 14, e.tick);
    // shockwaves: four lens rings, each a little later, smaller and weaker than the last
    for (let i = 0; i < 4; i++) {
      this.ripples.push({
        x: e.x,
        y: e.y,
        start: e.tick + i * 9,
        dur: 80 - i * 8,
        maxR: r * (4.2 - i * 0.7),
        width: 28 - i * 4,
        strength: (1.6 - i * 0.25) * k,
      });
    }
    this.fronts.push({
      x: e.x,
      y: e.y,
      maxR: r * 2.2,
      start: e.tick,
      dur: 50,
      rng: this.rngFor(e, 163),
    });
    // the bolt storm: fat strikes all over the crater and its rim, coming thick then thinning
    const rng = this.rngFor(e, 167);
    const strikes = Math.round(30 * k);
    for (let i = 0; i < strikes; i++) {
      const delay = Math.round(110 * (i / strikes) ** 1.6 + rng.range(0, 4));
      const bx = Math.round(e.x + rng.range(-1.25, 1.25) * r);
      const by = this.surfaceNear(bx, e.y, r * 1.4);
      const fat = i < 6 ? 2.2 : rng.range(1.2, 1.8);
      this.skyBolt(bx, by < 0 ? e.y : by, e.tick + delay, rng, fat, Math.round(rng.range(14, 24)));
      if (i % 3 === 0) {
        this.glows.push({
          x: bx,
          y: by < 0 ? e.y : by,
          r: 18,
          start: e.tick + delay,
          dur: 10,
          color: 0xa8d0ff,
          strength: 1.2,
        });
      }
    }
    // arcs crawling out along the ground, in waves
    for (let i = 0; i < 4; i++) {
      this.arcs(
        { ...e, tick: e.tick + i * 18, radius: r * 0.5, x: e.x + rng.range(-0.6, 0.6) * r },
        1.6,
      );
    }
    // ions and sparks blown out of the strike instead of dirt and smoke
    const n = Math.round((140 + r) * this.mult);
    const fast = 3 + r / 25;
    for (let i = 0; i < n; i++) {
      const a = rng.range(-0.1, 1.1) * Math.PI;
      const s = rng.range(0.3, 1) * fast;
      this.particles.add({
        x: e.x + Math.cos(a) * r * 0.2,
        y: floor - Math.sin(a) * r * 0.2,
        vx: Math.cos(a) * s,
        vy: -Math.sin(a) * s,
        life: rng.range(40, 90),
        size: i % 5 === 0 ? 2 : 1,
        color: i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0x90d0ff : 0x4a6cff,
        kind: PKind.Spark,
      });
    }
  }

  /**
   * While an Ion Cannon charges: vertical shockwaves down the sight line, one after another,
   * each wider and stronger, snaking sideways (the post shader wobbles them).
   */
  private ionColumnWaves(e: EffectEvent): void {
    const dur = e.params.ticks ?? 70;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      this.ripples.push({
        x: e.x + 0.5,
        y: e.y,
        start: e.tick + Math.round((dur - 14) * (i / n)),
        dur: 26,
        maxR: 18 + 34 * k,
        width: 8 + 6 * k,
        strength: 0.7 + 0.7 * k,
        column: true,
      });
    }
  }

  /** A later Ion Cannon shockwave: a lens ring, a dust front, a crackle of arcs and a bolt or two. */
  private ionPulse(e: EffectEvent, k: number): void {
    const r = e.radius;
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 60,
      maxR: r * 2.4,
      width: 22,
      strength: 1.2 * k,
    });
    this.fronts.push({
      x: e.x,
      y: e.y,
      maxR: r * 1.1,
      start: e.tick,
      dur: 36,
      rng: this.rngFor(e, 173),
    });
    this.kick(4 + r / 60, e.tick);
    this.tintSky([0, 0.4, 0.6, 1], 0.3);
    this.arcs({ ...e, radius: r * 0.35 }, 1.4);
    const rng = this.rngFor(e, 179);
    for (let i = 0; i < 3; i++) {
      const bx = Math.round(e.x + rng.range(-0.5, 0.5) * r);
      const by = this.surfaceNear(bx, e.y, r);
      this.skyBolt(bx, by < 0 ? e.y : by, e.tick + i * 4, rng, 1.6, 18);
    }
  }

  /**
   * Electric arcs crawling out along the ground from a strike: short jagged bolts that hug the
   * surface, flickering, with sparks spat off them.
   */
  private arcs(e: EffectEvent, k: number): void {
    const rng = this.rngFor(e, 59);
    const reach = Math.max(12, e.radius) * 2.5 * k;
    const n = 4 + Math.round(2 * k);
    for (let a = 0; a < n; a++) {
      const side = a % 2 === 0 ? -1 : 1;
      const len = reach * rng.range(0.5, 1);
      const pts: number[] = [];
      let x = Math.round(e.x);
      let y = this.surfaceNear(x, e.y, 30);
      if (y < 0) y = Math.round(e.y);
      for (let d = 0; d < len;) {
        const step = Math.round(rng.range(2, 5));
        const nx = x + side * step;
        const sy = this.surfaceNear(nx, y, 12);
        const ny = (sy < 0 ? y : sy) - Math.round(rng.range(0, 3));
        line(x, y, nx, ny, pts);
        x = nx;
        y = ny + Math.round(rng.range(0, 2));
        d += step;
        if (rng.next() < 0.25) {
          this.particles.add({
            x,
            y: y - 1,
            vx: side * rng.range(0.2, 1),
            vy: -rng.range(0.5, 1.6),
            life: rng.range(10, 22),
            size: 1,
            color: rng.next() < 0.5 ? 0xffffff : 0x9ad8ff,
            kind: PKind.Spark,
          });
        }
      }
      if (pts.length === 0) continue;
      const delay = Math.round(rng.range(0, 6));
      this.bolts.push({
        cells: Int32Array.from(pts),
        main: pts.length,
        start: e.tick + delay,
        dur: Math.round(rng.range(10, 18)),
        seed: rng.next() * 4294967296,
      });
    }
  }

  /** Current Ricochet Ball heat at tick `t` (0 once the last bounce is long past). */
  heatAt(t: number): number {
    return t - this.ricochetLast > RICOCHET_GAP ? 0 : this.ricochetHeat;
  }

  /**
   * A Ricochet Ball striking the ground: a hard pop in the ball's heat colour, a fan of sparks
   * thrown up off the surface, a tiny lens kick, and a scorched glint left on the ground. Each
   * bounce burns hotter: more sparks, a bigger pop, colours climbing towards white.
   */
  /** A beam glancing off crystal: a hard white-violet flash and glints sprayed along the bounce. */
  private reflect(e: EffectEvent): void {
    const rng = this.rngFor(e, 71);
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 5,
      start: e.tick,
      dur: 5,
      color: 0xe6d6ff,
      strength: 1.1,
    });
    const vx = (e.params.vx ?? 0) / 256;
    const vy = (e.params.vy ?? 0) / 256;
    const len = Math.max(0.01, Math.hypot(vx, vy));
    const n = Math.round(12 * this.mult) + 3;
    for (let i = 0; i < n; i++) {
      const s = rng.range(0.6, 2.2);
      this.particles.add({
        x: e.x + 0.5,
        y: e.y + 0.5,
        vx: (vx / len) * s + rng.range(-0.6, 0.6),
        vy: (vy / len) * s + rng.range(-0.6, 0.6),
        life: rng.range(6, 16),
        size: 1,
        color: rng.next() < 0.5 ? 0xffffff : 0xc3a2f4,
        kind: PKind.Spark,
      });
    }
  }

  /**
   * A railgun slug striking home: a hard white-cyan star of sparks thrown in all directions at
   * high speed, a short white flash, and a spit of hot fragments.
   */
  private railHit(e: EffectEvent): void {
    const rng = this.rngFor(e, 79);
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 7,
      start: e.tick,
      dur: 4,
      color: 0xffffff,
      strength: 1.3,
    });
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 12,
      start: e.tick,
      dur: 9,
      color: 0x60e0ff,
      strength: 0.7,
    });
    const n = Math.round(26 * this.mult) + 6;
    for (let i = 0; i < n; i++) {
      // eight spokes, like a star cracked into glass
      const k = i & 7;
      const ax = k === 0 || k === 1 || k === 7 ? 1 : k >= 3 && k <= 5 ? -1 : 0;
      const ay = k >= 1 && k <= 3 ? -1 : k >= 5 ? 1 : 0;
      const s = rng.range(1.2, 3.6);
      this.particles.add({
        x: e.x + 0.5,
        y: e.y + 0.5,
        vx: ax * s + rng.range(-0.25, 0.25),
        vy: ay * s + rng.range(-0.25, 0.25),
        life: rng.range(4, 12),
        size: 1,
        color: rng.next() < 0.45 ? 0xffffff : 0x60e0ff,
        kind: PKind.Spark,
      });
    }
  }

  /** An uncovered gas pocket going up: tongues of fire licking out of the hollow, then soot. */
  private pocketBurst(e: EffectEvent): void {
    const rng = this.rngFor(e, 73);
    const r = Math.max(4, e.radius);
    const n = Math.round((24 + r * 2) * this.mult) + 6;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: e.x + Math.round(rng.range(-r, r)),
        y: e.y + Math.round(rng.range(-r / 2, r / 2)),
        vx: rng.range(-0.5, 0.5),
        vy: -rng.range(0.6, 2.2),
        life: rng.range(14, 34),
        size: rng.next() < 0.3 ? 3 : 2,
        color: 0xff8a20,
        kind: PKind.Flame,
      });
    }
    const m = Math.round(10 * this.mult) + 2;
    for (let i = 0; i < m; i++) {
      this.particles.add({
        x: e.x + rng.range(-r, r),
        y: e.y - rng.range(0, r),
        vx: rng.range(-0.2, 0.2),
        vy: -rng.range(0.2, 0.6),
        life: rng.range(40, 80),
        size: rng.range(4, 8),
        color: 0x2a2220,
        kind: PKind.Smoke,
      });
    }
  }

  private ricochet(e: EffectEvent): void {
    const heat = this.heatAt(e.tick) + 1;
    this.ricochetHeat = heat;
    this.ricochetLast = e.tick;
    const rng = this.rngFor(e, 61);
    const h = Math.min(heat, RICOCHET_HEAT.length - 1);
    const col = RICOCHET_HEAT[h]!;
    const hot = RICOCHET_HEAT[Math.min(h + 1, RICOCHET_HEAT.length - 1)]!;
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 8 + heat * 2.5,
      start: e.tick,
      dur: 7,
      color: col,
      strength: 1.2,
    });
    this.ripples.push({
      x: e.x,
      y: e.y,
      start: e.tick,
      dur: 14,
      maxR: 12 + heat * 4,
      width: 5,
      strength: 0.5 + heat * 0.1,
    });
    const n = Math.round((20 + heat * 12) * this.mult) + 4;
    for (let i = 0; i < n; i++) {
      // a fan up and out off the surface, hottest sparks fastest
      const a = Math.PI + rng.range(0.1, Math.PI - 0.1);
      const s = rng.range(0.8, 2 + heat * 0.35);
      this.particles.add({
        x: e.x,
        y: e.y - 1,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rng.range(10, 18 + heat * 3),
        size: 1,
        color: i % 4 === 0 ? 0xffffff : rng.next() < 0.5 ? col : hot,
        kind: PKind.Spark,
      });
    }
    // a crackle of short arcs licking along the ground from the bounce, from the third bounce on
    if (heat >= 3) this.arcs({ ...e, radius: 4 + heat }, 0.35);
    this.kick(0.6 + heat * 0.25, e.tick);
  }

  /**
   * The Ricochet Ball going off: a white-hot core that blooms through the ball's colours in hard
   * bands, a sphere of sparks, arcs crawling out across the ground, motes of energy drifting up
   * and the sky blinking violet.
   */
  private ricochetBurst(e: EffectEvent, k: number): void {
    const heat = Math.max(1, this.heatAt(e.tick));
    this.ricochetHeat = 0;
    this.ricochetLast = -1000;
    const rng = this.rngFor(e, 67);
    const r = Math.max(8, e.radius);
    // nested hard-banded blooms: violet rim, pink body, white heart, staggered so it swells
    this.glows.push({
      x: e.x,
      y: e.y,
      r: r * 1.7,
      start: e.tick,
      dur: 22,
      color: 0x8040ff,
      strength: 1.1 * k,
    });
    this.glows.push({
      x: e.x,
      y: e.y,
      r: r * 1.15,
      start: e.tick,
      dur: 16,
      color: 0xff60d0,
      strength: 1.3 * k,
    });
    this.glows.push({
      x: e.x,
      y: e.y,
      r: r * 0.6,
      start: e.tick,
      dur: 12,
      color: 0xffffff,
      strength: 1.6 * k,
    });
    this.glows.push({
      x: e.x,
      y: e.y,
      r: r * 0.9,
      start: e.tick + 3,
      dur: 14,
      color: 0x70e0ff,
      strength: 0.9 * k,
    });
    const n = Math.round((90 + heat * 12) * k * this.mult) + 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.08, 0.08);
      const s = rng.range(1.2, 2.2 + r / 10);
      const c = rng.next();
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 0.6,
        life: rng.range(14, 30),
        size: 1,
        color: c < 0.3 ? 0xffffff : c < 0.55 ? 0xff70d0 : c < 0.8 ? 0xb080ff : 0x70e0ff,
        kind: PKind.Spark,
      });
    }
    // slow motes of energy that hang in the air after the flash
    const motes = Math.round(24 * k * this.mult) + 4;
    for (let i = 0; i < motes; i++) {
      this.particles.add({
        x: e.x + rng.range(-r * 0.6, r * 0.6),
        y: e.y + rng.range(-r * 0.6, r * 0.3),
        vx: rng.range(-0.25, 0.25),
        vy: -rng.range(0.6, 1.4),
        life: rng.range(40, 70),
        size: 1,
        color: rng.next() < 0.5 ? 0xffa0f0 : 0xa0f0ff,
        kind: PKind.Spark,
      });
    }
    this.arcs({ ...e, radius: r * 0.7 }, 0.8 * k);
    this.tintSky([0, 0.55, 0.3, 0.9], 0.35 * k);
    this.split = Math.max(this.split, 1.5 * k);
  }

  /** Average colour of solid terrain around (x, y), for dirt chunks and dust. */
  private dustColor(x: number, y: number): number {
    const p = this.probe;
    for (let r = 0; r < 12; r += 2) {
      for (const [dx, dy] of [
        [0, r],
        [r, 0],
        [-r, 0],
        [0, -r],
        [r, r],
        [-r, r],
      ] as const) {
        const m = p.material(Math.round(x + dx), Math.round(y + dy));
        if (m !== 0) return p.color(m);
      }
    }
    return 0x7a5a3a;
  }

  /**
   * Dirt Bomb: cosmetic clods in hard shade bands that fly the same fans as the sim's dirt (and
   * fade before they land, so only sim debris makes ground), a dust surge rolling out along the
   * ground both ways, and a dirty dust pall over the crater.
   */
  private dirtBurst(e: EffectEvent): void {
    const rng = this.rngFor(e, 13);
    const base = this.dustColor(e.x, e.y + 4);
    const lo = ((e.params.low ?? 20) * Math.PI) / 180;
    const hi = ((e.params.high ?? 70) * Math.PI) / 180;
    const vMax = e.params.speed ?? 4;
    const lift = e.params.lift ?? 0;
    const nClod = Math.round(160 * this.mult) + 8;
    for (let i = 0; i < nClod; i++) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const a = rng.range(lo, hi);
      const s = rng.range(0.45, 1) * vMax;
      this.particles.add({
        x: e.x + side * rng.range(0, 6),
        y: e.y - lift + rng.range(-3, 3),
        vx: side * Math.cos(a) * s,
        vy: -Math.sin(a) * s,
        life: rng.range(30, 70),
        size: rng.next() < 0.25 ? 3 : 2,
        color: shade(base, DIRT_BANDS[Math.floor(rng.next() * DIRT_BANDS.length)]!),
        kind: PKind.Chunk,
      });
    }
    const nSurge = Math.round(48 * this.mult) + 4;
    for (let i = 0; i < nSurge; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.particles.add({
        x: e.x + side * rng.range(2, 10),
        y: e.y - rng.range(0, 4),
        vx: side * rng.range(1, 3.2),
        vy: -rng.range(0, 0.3),
        life: rng.range(40, 80),
        size: rng.range(3, 6),
        color: shade(base, rng.next() < 0.5 ? 0.85 : 1.05),
        kind: PKind.Dust,
      });
    }
    const nPall = Math.round(14 * Math.max(0.5, this.mult));
    for (let i = 0; i < nPall; i++) {
      this.particles.add({
        x: e.x + rng.range(-12, 12),
        y: e.y - rng.range(0, 14),
        vx: rng.range(-0.3, 0.3),
        vy: -rng.range(0.1, 0.5),
        life: rng.range(70, 120),
        size: rng.range(5, 9),
        color: shade(base, 0.7),
        kind: PKind.Smoke,
      });
    }
    this.kick(5, e.tick);
  }

  private burst(e: EffectEvent, count: number): void {
    // `count: 0` asks for no burst at all: no sparks, and no hot soot in the air either
    if (count <= 0) return;
    const rng = this.rngFor(e, 1);
    const r = Math.max(4, e.radius);
    // the blast shoves the air outward and leaves hot soot hanging in it
    this.fluid.splat(e.x, e.y, r * 1.5, 0.3 + r * 0.05, 0, 1 + r / 30, 0.5 + r / 60, 0, true);
    const nSpark = Math.round(count * 1.4 * this.mult);
    const speed = 0.8 + r / 14;
    for (let i = 0; i < nSpark; i++) {
      const a = rng.range(Math.PI * 0.05, Math.PI * 0.95);
      const s = rng.range(0.3, 1) * speed;
      this.particles.add({
        x: e.x + rng.range(-2, 2),
        y: e.y + rng.range(-2, 2),
        vx: Math.cos(a) * s * 1.2,
        vy: -Math.sin(a) * s,
        life: rng.range(14, 36),
        size: rng.range(0.5, 1.1),
        color: rng.next() < 0.3 ? 0xfff0a0 : 0xff7a1a,
        kind: PKind.Spark,
      });
    }
    // chunks of whatever the blast was in, thrown from the crater rim
    const base = this.dustColor(e.x, e.y + r * 0.5);
    const nChunk = Math.round(count * this.mult);
    for (let i = 0; i < nChunk; i++) {
      const a = rng.range(Math.PI * 0.1, Math.PI * 0.9);
      const s = rng.range(0.4, 1) * speed * 1.1;
      this.particles.add({
        x: e.x + Math.cos(a) * r * 0.6,
        y: e.y - Math.sin(a) * r * 0.4,
        vx: Math.cos(a) * s,
        vy: -Math.sin(a) * s,
        life: rng.range(30, 60),
        size: 1,
        color: shade(base, rng.range(0.75, 1.15)),
        kind: PKind.Chunk,
      });
    }
    if (count > 0 && e.radius >= CHUNK_MIN_RADIUS) this.throwChunks(e, rng);
    // the shock front: a ring of sparks racing out from the centre with the blast, evenly spaced
    // so it reads as a ring, each a different brightness; the ones that meet the ground skitter
    const nRing = Math.round((24 + r * 1.2) * Math.max(0.5, this.mult));
    const ringSpeed = 0.9 + r / 10;
    for (let i = 0; i < nRing; i++) {
      const a = ((i + rng.next() * 0.6) / nRing) * Math.PI * 2;
      const s = ringSpeed * rng.range(0.85, 1.1);
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rng.range(8, 16),
        size: 1,
        color: rng.next() < 0.5 ? 0xffffff : 0xffd080,
        kind: PKind.Spark,
      });
    }
    // flash motes: a cloud of white cells strobing inside the fireball for the first ticks
    const nFlash = Math.round((10 + r) * Math.max(0.5, this.mult));
    for (let i = 0; i < nFlash; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = Math.sqrt(rng.next()) * r * 0.7;
      this.particles.add({
        x: e.x + Math.cos(a) * d,
        y: e.y + Math.sin(a) * d,
        vx: Math.cos(a) * 0.3,
        vy: Math.sin(a) * 0.3,
        life: rng.range(5, 11),
        size: 1,
        color: rng.next() < 0.6 ? 0xffffff : 0xfff0a0,
        kind: PKind.Glitter,
      });
    }
    // dust kicked along the ground either side of the crater, rolling outward
    this.groundDust(e, rng, r);
    const nSmoke = Math.round((3 + r / 5) * Math.max(0.5, this.mult));
    for (let i = 0; i < nSmoke; i++) {
      this.particles.add({
        x: e.x + rng.range(-r, r) * 0.5,
        y: e.y + rng.range(-r, r) * 0.3,
        vx: rng.range(-0.25, 0.25),
        vy: -rng.range(0.05, 0.4),
        life: rng.range(50, 90),
        size: rng.range(r * 0.25, r * 0.5),
        color: rng.next() < 0.5 ? 0x4a4048 : 0x6a5e62,
        kind: PKind.Smoke,
      });
    }
  }

  /**
   * Leave a smoke column over a big blast. Fire and plain blasts and kinetic hits smoke; cold,
   * shock, dig and corrosive blasts don't. A blast landing on a fresh column feeds that column
   * instead of starting a second one, so MIRVs and meteor showers don't stack up dozens.
   */
  private smokeColumn(e: EffectEvent, dt: number): void {
    if (e.radius < SMOKE_COLUMN_MIN_R || dt > 2) return;
    const dur = Math.round(420 + e.radius * 10);
    for (const c of this.columns) {
      if (Math.abs(c.x - e.x) > Math.max(c.r, e.radius) || e.tick - c.start > c.dur * 0.5) continue;
      c.r = Math.min(120, Math.max(c.r, e.radius) + 4);
      c.dur = Math.max(c.dur, e.tick - c.start + dur);
      if (dt === 2) c.color = SOOT[2];
      return;
    }
    if (this.columns.length >= SMOKE_COLUMN_MAX) this.columns.shift();
    // rise from the crater floor or the ground under an airburst, not from inside the dirt
    const y = this.craterFloor(Math.round(e.x), e.y, e.radius);
    const color =
      dt === 2 ? SOOT[2] : dt === 1 ? shade(this.dustColor(e.x, e.y + 4), 0.45) : SOOT[1];
    this.columns.push({
      x: e.x,
      y,
      r: e.radius,
      start: e.tick,
      dur,
      color,
      rng: this.rngFor(e, 53),
    });
  }

  /** First solid cell under (x, y) within a crater's depth, less a cell; `y` itself if none. */
  /** Grains of the local ground lifted along the surface either side of a blast, rolling out. */
  private groundDust(e: EffectEvent, rng: FxRng, r: number): void {
    const p = this.probe;
    const reach = Math.round(r * 2.2);
    const n = Math.round(reach * 0.5 * Math.max(0.5, this.mult));
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < n; i++) {
        const dx = r * 0.8 + rng.next() * (reach - r * 0.8);
        const x = Math.round(e.x + side * dx);
        if (x < 0 || x >= p.width) continue;
        // the surface under this column, searched from above the blast down
        let y = -1;
        const y0 = Math.max(0, Math.round(e.y - r));
        const y1 = Math.min(p.height - 1, Math.round(e.y + r * 1.5));
        for (let yy = y0; yy <= y1; yy++) {
          if (p.material(x, yy) !== 0) {
            y = yy;
            break;
          }
        }
        if (y < 0) continue;
        const far = dx / reach;
        this.particles.add({
          x,
          y: y - 0.5,
          vx: side * (0.5 + rng.next() * 0.8) * (1 - far * 0.5),
          vy: -rng.range(0.1, 0.5) * (1 - far * 0.6),
          life: rng.range(14, 30) * (1.2 - far * 0.5),
          size: 1,
          color: shade(this.dustColor(x, y), rng.range(0.9, 1.3)),
          kind: PKind.Chunk,
        });
      }
    }
  }

  private craterFloor(x: number, y: number, r: number): number {
    const p = this.probe;
    if (x < 0 || x >= p.width) return y;
    const y1 = Math.min(p.height - 1, Math.round(y + r * 1.3) + 4);
    for (let yy = Math.max(0, Math.round(y)); yy <= y1; yy++) {
      if (p.material(x, yy) !== 0) return yy - 1;
    }
    return y;
  }

  /** Feed each smoke column: thick hot soot at first, thinning to wisps before it stops. */
  private tickColumns(t: number): void {
    for (let i = this.columns.length - 1; i >= 0; i--) {
      const c = this.columns[i]!;
      const k = (t - c.start) / c.dur;
      if (k >= 1) {
        this.columns.splice(i, 1);
        continue;
      }
      if (k < 0) continue;
      const big = c.r / 24;
      const fade = (1 - k) * (1 - k);
      // the source wanders over the crater floor, so the column is ragged, not a pipe
      const w = c.r * (0.18 + 0.12 * (1 - k));
      const x = c.x + c.rng.range(-w, w);
      // the first seconds are hot: the soot shoots up fast, later it only drifts
      const rise = 0.5 * (1 + (1 - k) * 0.8) * Math.min(1.8, 0.75 + big * 0.25);
      this.fluid.splat(
        x,
        c.y - 2,
        Math.max(4, w * 0.6 + big * 2),
        0,
        -rise,
        (0.3 + big * 0.25) * fade,
        0.25 * fade * fade,
      );
    }
  }

  /**
   * Debris chunks out of a big blast: blocks of the ground it was in, sampled round the crater
   * rim (so grass, dirt and rock come out in their own colours), thrown up and out in a cone.
   * More and bigger chunks the bigger the blast.
   */
  private throwChunks(e: EffectEvent, rng: FxRng): void {
    const r = e.radius;
    const n = Math.round(Math.min(64, 6 + (r - CHUNK_MIN_RADIUS) * 0.7) * Math.max(0.6, this.mult));
    const big = r >= 50 ? 1 : 0;
    const speed = 1.3 + Math.min(2.4, r / 32);
    for (let i = 0; i < n; i++) {
      // where on the rim it came from sets its colour and its launch angle
      const a = rng.range(Math.PI * 0.12, Math.PI * 0.88);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const col = this.dustColor(e.x + ca * (r + 1), e.y + sa * (r * 0.6 + 1));
      const s = rng.range(0.55, 1) * speed;
      const w = 2 + Math.floor(rng.next() * (2 + big));
      const h = Math.max(1, w - Math.floor(rng.next() * 2));
      // a clod of loose grains: the GPU engine breaks it into single cells that fly as one,
      // then scatter, bounce and settle on the ground before they crumble away
      this.particles.add({
        x: e.x + ca * r * 0.55,
        y: e.y - sa * r * 0.35,
        vx: ca * s * 1.15 + rng.range(-0.2, 0.2),
        vy: -sa * s - rng.range(0.4, 1),
        size: Math.max(w, h),
        life: rng.range(150, 260) + 60,
        color: shade(col, DIRT_BANDS[Math.floor(rng.next() * DIRT_BANDS.length)]! * 0.8),
        kind: PKind.Chunk,
      });
    }
  }

  drawChunks(batch: QuadBatch): void {
    this.chunks.draw(batch);
  }

  /** Advance continuing effects by one tick (called once per sim tick, in tick order). */
  tick(t: number): void {
    this.chunks.step(CHUNK_GRAVITY, this.probe.height);
    this.groundLife(t);
    // mushroom clouds are built from GPU motes, spawned each tick along the cloud's shape
    for (const m of this.mushrooms) {
      if (t >= m.start && t <= m.start + m.life) emitMushroom(m, t, this.particles, this.mult);
      // the fireball's heat pours into the smoke field for the first seconds of the rise
      const since = t - m.start - m.fuse;
      if (since >= 0 && since < 90) {
        const k = 1 - since / 90;
        this.fluid.splat(m.x, m.y - m.r * 0.3, m.r * 0.9, 0, -2.5 * k, 1.2 * k, 1.5 * k);
      }
    }
    this.feedJets(t);
    this.tickColumns(t);
    this.tickStrands(t);
    this.fireworkTick(t);
    // shockwave fronts: dust and grit kicked up along the ground as the ring passes
    this.fronts = this.fronts.filter((f) => {
      const k = (t - f.start) / f.dur;
      // the plasma ring coasts on past the end of the shove, slowing and thinning out
      if (k > (f.portal ? PORTAL_COAST : 1)) return false;
      const r =
        f.maxR * (k <= 1 ? k : 1 + (k - 1) * (1 - (k - 1) / (2 * (PORTAL_COAST - 1))) * 0.5);
      if (f.portal) this.portalRingTick(f, r, k);
      if (k > 1) return true;
      if (f.cold) {
        this.frostFrontTick(f, r);
        return true;
      }
      for (const side of [-1, 1]) {
        const x = Math.round(f.x + side * r);
        const y = this.surfaceNear(x, f.y, f.maxR);
        if (y < 0) continue;
        const n = Math.max(1, Math.round(3 * this.mult));
        const col = this.dustColor(x, y + 1);
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: x + f.rng.range(-1.5, 1.5),
            y: y - f.rng.range(0, 2),
            vx: side * f.rng.range(0.3, 1.2),
            vy: -f.rng.range(0.1, 0.7),
            life: f.rng.range(24, 48),
            size: f.rng.range(2.5, 5),
            color: shade(col, 1.15),
            kind: PKind.Dust,
          });
        }
        if (f.rng.next() < 0.6 * this.mult) {
          this.particles.add({
            x,
            y: y - 1,
            vx: side * f.rng.range(0.4, 1.4),
            vy: -f.rng.range(0.8, 2),
            life: 40,
            size: 1,
            color: col,
            kind: PKind.Chunk,
          });
        }
      }
      return true;
    });
    this.vortices = this.vortices.filter((v) => {
      const k = (t - v.start) / v.dur;
      if (k > 1) return false;
      if (k < 0) return true;
      const n = Math.max(1, Math.round((3 + k * 6) * this.mult));
      // spiral in: mostly tangential, pulled inward, faster as it tightens
      for (let i = 0; i < n; i++) {
        const a = v.rng.range(0, Math.PI * 2);
        const rr = v.r * v.rng.range(0.5, 1.1);
        const life = v.rng.range(14, 24);
        const sp = rr / life;
        this.particles.add({
          x: v.x + Math.cos(a) * rr,
          y: v.y + Math.sin(a) * rr * 0.8,
          vx: -Math.cos(a) * sp * 0.9 - Math.sin(a) * sp * 0.8,
          vy: (-Math.sin(a) * sp * 0.9 + Math.cos(a) * sp * 0.8) * 0.8,
          life,
          size: 1,
          color: v.rng.next() < 0.35 ? 0xffffff : v.rng.next() < 0.5 ? 0xb070ff : 0x6040c0,
          kind: PKind.Spark,
        });
      }
      if (t === v.start) this.tintSky([0, 0.2, 0.08, 0.45], 0.3);
      return true;
    });
    for (const f of this.funnels) this.funnelDust(f, t);
    this.funnels = this.funnels.filter((f) => t - f.last <= 12);
    this.magnets = this.magnets.filter((m) => t - m.last <= 2);
    this.wells = this.wells.filter((w) => t - w.last <= 2);
    this.holes = this.holes.filter((h) => t - h.last <= 3);
    this.novas = this.novas.filter((s) => t - s.last <= 2);
    this.kaijus = this.kaijus.filter((k) => t - k.last <= 4);
    this.portals = this.portals.filter((p) => t - p.last <= 4);
    this.ripples = this.ripples.filter((r) => t - r.start <= r.dur);
    this.glows = this.glows.filter((g) => t - g.start <= g.dur);
    for (const b of this.bolts) this.boltBits(b, t);
    this.bolts = this.bolts.filter((b) => t - b.start <= b.dur);
    if (this.ions.active) {
      const rumble = this.ions.tick(t, this.mult);
      if (rumble > 0) {
        if (this.shakeLeft(t) < rumble * 0.6) this.kick(rumble, t);
        this.tintSky([0, 0.3, 0.5, 0.9], 0.08);
      }
    }
    if (this.lances.active) {
      // a firing lance keeps the ground rumbling and the sky lit
      const rumble = this.lances.tick(t, this.mult);
      if (rumble > 0) {
        if (this.shakeLeft(t) < rumble * 0.6) this.kick(rumble, t);
        this.tintSky([0, 0.7, 0.45, 0.2], 0.06);
      }
    }
    this.crystals = this.crystals.filter((b) => t - b.start <= b.dur);
    const s = this.sky;
    s[0] *= 0.86;
    s[1] *= 0.86;
    s[2] *= 0.86;
    this.skyFlash = Math.max(s[0], s[1], s[2]);
    if (this.skyFlash < 0.002) {
      this.skyFlash = 0;
      s[0] = s[1] = s[2] = 0;
    }
    this.split = this.split > 0.3 ? this.split * 0.9 : 0;
    // a tornado's storm darkens the sky while the funnel is up (held, after the flash decay)
    for (const f of this.funnels) {
      if (t - f.last > 2) continue;
      const dim = 0.16 * Math.min(1, (t - f.born) / 30);
      s[0] = Math.min(s[0], -dim);
      s[1] = Math.min(s[1], -dim * 0.95);
      s[2] = Math.min(s[2], -dim * 0.8);
    }
    this.flushSmoke();
  }

  /**
   * One tick of a frost front: at the ring's edge on both sides, ice glints spark up off the
   * surface, frost crystals crackle out and a low cold mist is left behind it.
   */
  private frostFrontTick(f: Front, r: number): void {
    for (const side of [-1, 1]) {
      for (let j = 0; j < 2; j++) {
        const x = Math.round(f.x + side * (r - j * 2));
        const y = this.surfaceNear(x, f.y, f.maxR);
        if (y < 0) continue;
        const n = Math.max(1, Math.round(3 * this.mult));
        for (let i = 0; i < n; i++) {
          this.particles.add({
            x: x + f.rng.range(-1.5, 1.5),
            y: y - f.rng.range(0, 1.5),
            vx: side * f.rng.range(0.05, 0.6),
            vy: -f.rng.range(0.4, 1.6),
            life: f.rng.range(10, 26),
            size: 1,
            color: ICE[Math.floor(f.rng.next() * 3)]!,
            kind: PKind.Spark,
          });
        }
        if (f.rng.next() < 0.5 * this.mult) {
          this.particles.add({
            x,
            y: y - 1,
            vx: side * f.rng.range(0.1, 0.5),
            vy: -f.rng.range(0.03, 0.12),
            life: f.rng.range(60, 110),
            size: f.rng.range(4, 8),
            color: f.rng.next() < 0.5 ? 0xe4f2fc : 0xc2def2,
            kind: PKind.Dust,
          });
        }
      }
    }
    // the leading edge itself: a ring of cold light hugging the ground
    const gx = Math.round(f.x - r);
    const hx = Math.round(f.x + r);
    for (const x of [gx, hx]) {
      const y = this.surfaceNear(x, f.y, f.maxR);
      if (y >= 0)
        this.glows.push({
          x,
          y,
          r: 3,
          start: Math.floor(f.start + (r / f.maxR) * f.dur),
          dur: 6,
          color: 0xbfe4fa,
          strength: 0.9,
        });
    }
  }

  /**
   * A shockwave's ring of force in the air: single pixels on the expanding circle, snapped to
   * cells, in hard bands from a white-cyan leading edge back to deep violet, swirling a little
   * along the ring so it shimmers. Only where there is air (the ground shows the dust front).
   */
  private portalRingTick(f: Front, r: number, k: number): void {
    if (r < 3) return;
    const p = this.probe;
    const rng = f.rng;
    // a thick, lumpy band: turbulent wisps of plasma, the hot leading edge, sparkles and arcs
    const band = Math.max(4, Math.min(22, f.maxR * 0.14));
    const fade = k <= 1 ? 1 : Math.max(0, (PORTAL_COAST - k) / (PORTAL_COAST - 1));
    // per-front lumps: a few slow sine lobes around the ring, fixed for this front
    // the lobes roll round the ring as it goes, so the band wobbles like jelly
    const ph = f.x * 0.37 + f.y * 0.11 + f.start + (f.rng.next() * 0.1 + k * 6);
    const lump = (a: number): number =>
      Math.sin(a * 3 + ph) * 0.5 +
      Math.sin(a * 7 - ph * 1.3) * 0.3 +
      Math.sin(a * 13 + ph * 0.7) * 0.2;
    const air = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < p.width && y < p.height && p.material(x, y) === 0;
    const circ = 2 * Math.PI * r;
    const speed = (f.maxR / f.dur) * (k <= 1 ? 1 : 0.5);
    // plasma puffs (each breaks into a cloud of motes the swirl tears into wisps)
    const nPuff = Math.round(Math.min(Math.round(240 * this.mult) + 6, circ / 3) * fade);
    for (let i = 0; i < nPuff; i++) {
      const a = rng.range(0, Math.PI * 2);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const l = lump(a);
      const rr = r * (1 + l * 0.07) - rng.next() * rng.next() * band * (1.2 + l * 0.6);
      if (rr < 1) continue;
      const x = Math.round(f.x + ca * rr);
      const y = Math.round(f.y + sa * rr);
      if (!air(x, y)) continue;
      // ride outward with the ring, a little slower, so the band thickens into a trailing torus
      const out = speed * rng.range(0.55, 0.95) + Math.max(0, l) * 0.25;
      const tw = rng.range(-0.3, 0.3) + l * 0.35;
      this.particles.add({
        x,
        y,
        vx: ca * out - sa * tw,
        vy: sa * out + ca * tw,
        life: rng.range(22, 42),
        size: Math.round(rng.range(3, 6 + Math.max(0, l) * 3)),
        color: PORTAL[Math.floor(rng.next() * PORTAL.length)]!,
        kind: PKind.Plasma,
      });
    }
    // sparkles: tiny bright stars strewn through the band
    const nStar = Math.min(Math.round(40 * this.mult) + 2, Math.round(circ / 14));
    for (let i = 0; i < nStar; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = r - rng.next() * band * 1.6;
      const x = Math.round(f.x + Math.cos(a) * rr);
      const y = Math.round(f.y + Math.sin(a) * rr);
      if (rr < 1 || !air(x, y)) continue;
      this.particles.add({
        x,
        y,
        vx: Math.cos(a) * speed * rng.range(0.5, 0.9),
        vy: Math.sin(a) * speed * rng.range(0.5, 0.9),
        life: rng.range(10, 26),
        size: 1,
        color: rng.next() < 0.5 ? 0x60c8ff : 0x9a7cff,
        kind: PKind.Glitter,
      });
    }
    // arcs: short crackling filaments wandering along the ring
    const nArc = Math.min(Math.round(8 * this.mult) + 1, Math.round(circ / 60) + 1);
    for (let i = 0; i < nArc; i++) {
      let a = rng.range(0, Math.PI * 2);
      let rr = r - rng.next() * band;
      const len = Math.round(rng.range(6, 16));
      const da = (rng.next() < 0.5 ? -1 : 1) / Math.max(4, rr);
      for (let j = 0; j < len; j++) {
        a += da;
        rr += rng.range(-1.2, 1.2);
        const x = Math.round(f.x + Math.cos(a) * rr);
        const y = Math.round(f.y + Math.sin(a) * rr);
        if (rr < 1 || !air(x, y)) break;
        this.particles.add({
          x,
          y,
          vx: 0,
          vy: 0,
          life: rng.range(4, 9),
          size: 1,
          color: 0x60d8ff,
          kind: PKind.Plasma,
        });
      }
    }
  }

  /**
   * A Plasma Orb hanging in the air, each tick: a spinning ball of plasma motes, a hot core, a
   * sparkle or two and now and then a short arc crackling out of it. Grows in for its first ticks
   * and churns harder as its timer runs down.
   */
  private plasmaOrb(e: EffectEvent): void {
    const rng = this.rngFor(e, 23);
    const age = e.params.age ?? 0;
    const life = Math.max(1, e.params.life ?? 150);
    const grow = Math.min(1, age / 18);
    const late = age / life;
    const R = 4 + 7 * grow;
    const n = Math.round((10 + late * 8) * this.mult) + 3;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = R * rng.range(0.5, 1.1);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const spin = rng.range(0.4, 0.9);
      this.particles.add({
        x: e.x + ca * rr,
        y: e.y + sa * rr,
        vx: -sa * spin - ca * 0.15,
        vy: ca * spin - sa * 0.15,
        life: rng.range(8, 14),
        size: Math.round(rng.range(2, 4)),
        color: PORTAL[Math.floor(rng.next() * PORTAL.length)]!,
        kind: PKind.Plasma,
      });
    }
    // hot core: a few white-cyan cells that flicker in place
    for (let i = 0; i < 4; i++) {
      this.particles.add({
        x: e.x + Math.round(rng.range(-R * 0.4, R * 0.4)),
        y: e.y + Math.round(rng.range(-R * 0.4, R * 0.4)),
        vx: 0,
        vy: 0,
        life: 3,
        size: 1,
        color: rng.next() < 0.5 ? 0xe8fcff : 0x9ae8ff,
        kind: PKind.Plasma,
      });
    }
    if (rng.next() < 0.3 * this.mult) {
      const a = rng.range(0, Math.PI * 2);
      this.particles.add({
        x: e.x + Math.cos(a) * R,
        y: e.y + Math.sin(a) * R,
        vx: Math.cos(a) * 0.8,
        vy: Math.sin(a) * 0.8,
        life: rng.range(10, 20),
        size: 1,
        color: 0x9ae0ff,
        kind: PKind.Glitter,
      });
    }
    // crackle: a short arc licking out of the ball
    if (age > 12 && rng.next() < 0.18 + late * 0.3) {
      const a = rng.range(0, Math.PI * 2);
      const len = rng.range(10, 22);
      this.arc(e.x, e.y, e.x + Math.cos(a) * len, e.y + Math.sin(a) * len, e.tick, rng, 6);
    }
  }

  /**
   * A Plasma Orb bursting: the ball blows out as a sphere of plasma motes racing outward, arcs
   * lashing out in every direction, sparkles, a jolt and a blue-violet cast over the sky.
   */
  private plasmaBurst(e: EffectEvent): void {
    const rng = this.rngFor(e, 31);
    const k = e.params.strength ?? 1;
    const r = Math.max(10, e.radius);
    const n = Math.round(90 * k * this.mult) + 10;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, r * 0.4);
      const sp = rng.range(0.8, 2.6);
      this.particles.add({
        x: e.x + Math.cos(a) * d,
        y: e.y + Math.sin(a) * d,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(18, 36),
        size: Math.round(rng.range(3, 6)),
        color: PORTAL[Math.floor(rng.next() * PORTAL.length)]!,
        kind: PKind.Plasma,
      });
    }
    const m = Math.round(50 * k * this.mult) + 6;
    for (let i = 0; i < m; i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = rng.range(1.5, 4);
      this.particles.add({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rng.range(14, 30),
        size: 1,
        color: rng.next() < 0.5 ? 0x9ae8ff : 0xc8a8ff,
        kind: PKind.Glitter,
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const len = r * rng.range(1.2, 2.2);
      this.arc(
        e.x,
        e.y,
        e.x + Math.cos(a) * len,
        e.y + Math.sin(a) * len,
        e.tick + (i % 3),
        rng,
        12,
      );
    }
    this.tintSky([0, 0.3, 0.32, 0.85], 0.35 * k);
    this.kick(4 * k, e.tick);
  }

  /** A Plasma Orb lashing a tank: a jagged arc from the ball to it, sparks and plasma where it lands. */
  private plasmaZap(e: EffectEvent): void {
    const rng = this.rngFor(e, 29);
    const tx = e.params.tx ?? e.x;
    const ty = e.params.ty ?? e.y;
    this.arc(e.x, e.y, tx, ty, e.tick, rng, 10);
    this.arc(e.x, e.y, tx + rng.range(-4, 4), ty + rng.range(-3, 3), e.tick + 2, rng, 7);
    const n = Math.round(14 * this.mult) + 3;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: tx + rng.range(-3, 3),
        y: ty + rng.range(-3, 3),
        vx: rng.range(-1.6, 1.6),
        vy: rng.range(-2, 0.6),
        life: rng.range(8, 18),
        size: 1,
        color: rng.next() < 0.5 ? 0x9ae8ff : 0xc0a0ff,
        kind: PKind.Glitter,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.particles.add({
        x: tx + rng.range(-3, 3),
        y: ty + rng.range(-3, 3),
        vx: rng.range(-0.3, 0.3),
        vy: -rng.range(0, 0.4),
        life: rng.range(10, 18),
        size: 3,
        color: PORTAL[Math.floor(rng.next() * PORTAL.length)]!,
        kind: PKind.Plasma,
      });
    }
    this.kick(1.2, e.tick);
  }

  /** A jagged bolt of whole cells from (x0, y0) to (x1, y1), drawn with the lightning bolts. */
  private arc(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    tick: number,
    rng: FxRng,
    dur: number,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;
    const nx = -dy / len;
    const ny = dx / len;
    const segs = Math.max(2, Math.round(len / 5));
    const pts: number[] = [];
    let px = Math.round(x0);
    let py = Math.round(y0);
    for (let s = 1; s <= segs; s++) {
      const k = s / segs;
      const j = s === segs ? 0 : rng.range(-1, 1) * Math.min(5, len * 0.12);
      const qx = Math.round(x0 + dx * k + nx * j);
      const qy = Math.round(y0 + dy * k + ny * j);
      // whole cells between the kinks
      const steps = Math.max(Math.abs(qx - px), Math.abs(qy - py), 1);
      for (let i = 1; i <= steps; i++) {
        pts.push(
          Math.round(px + ((qx - px) * i) / steps),
          Math.round(py + ((qy - py) * i) / steps),
        );
      }
      px = qx;
      py = qy;
    }
    this.bolts.push({
      cells: Int32Array.from(pts),
      main: pts.length,
      start: tick,
      dur,
      w: 0.7,
      seed: rng.next() * 4294967296,
    });
  }

  /** Top surface row near (x, y): first solid cell with air above, scanning ±range. */
  private surfaceNear(x: number, y: number, range: number): number {
    const p = this.probe;
    if (x < 0 || x >= p.width) return -1;
    const y0 = Math.max(1, Math.round(y - range));
    const y1 = Math.min(p.height - 1, Math.round(y + range));
    for (let yy = y0; yy <= y1; yy++) {
      if (p.material(x, yy) !== 0 && p.material(x, yy - 1) === 0) return yy;
    }
    return -1;
  }

  /**
   * A wreck's ammunition cooking off (render-only, see `wreck.ts`): a small blast of sparks and
   * soot, a hard-banded flash and a jolt of the camera; the last one is bigger.
   */
  cookOff(x: number, y: number, radius: number, big: boolean, t: number): void {
    const e: EffectEvent = { type: 'cookOff', tick: t, x, y, radius, params: {} };
    this.burst(e, big ? 26 : 12);
    this.glows.push({
      x,
      y,
      r: radius * 2.2,
      start: t,
      dur: big ? 16 : 10,
      color: 0xffa040,
      strength: big ? 1.1 : 0.8,
    });
    if (big) {
      this.ripples.push({ x, y, start: t, dur: 18, maxR: 26, width: 6, strength: 0.5 });
      this.tintSky(DT_LOOK[2]!, 0.15);
    }
    this.kick(big ? 4 : 2, t);
  }

  /** How much of the current shake is left at sim tick `t`, in cells. */
  shakeLeft(t: number): number {
    const age = t + this.held - this.shakeStart;
    if (this.shakeAmp <= 0 || age > this.shakeDur || age < 0) return 0;
    return this.shakeAmp * (1 - age / this.shakeDur) ** 2;
  }

  /**
   * Start a shake of peak `amp` cells at sim tick `tick`, unless the one playing is still
   * stronger: a small hit never restarts a big shake at full strength, nor cuts it short.
   */
  kick(amp: number, tick: number): void {
    if (amp <= 0 || amp < this.shakeLeft(tick)) return;
    this.shakeAmp = amp;
    this.shakeStart = tick + this.held;
    this.shakeDur = shakeTicks(amp);
  }

  /** Screen shake offset in cells at render time `t` (sim ticks; hit-stop holds add `held`). */
  shake(t: number): [number, number] {
    const a = this.shakeLeft(t);
    if (a <= 0) return [0, 0];
    const age = t + this.held - this.shakeStart;
    // the first beat thumps down, then it rattles off to both sides
    return [Math.sin(age * 2.1) * a, Math.sin(age * 2.9 + 1.6) * a * 0.6];
  }

  /**
   * A gas canister cracking open: a jet of green spray and droplets up out of the crater, fat
   * toxic puffs rolling out low to both sides, and a sickly tint on the sky.
   */
  private gasBurst(e: EffectEvent): void {
    const rng = this.rngFor(e, 23);
    const n = Math.round((e.params.count ?? 18) * this.mult) + 4;
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.particles.add({
        x: e.x + rng.range(-2, 2),
        y: e.y - rng.range(0, 3),
        vx: side * rng.range(0.4, 1.6),
        vy: -rng.range(0.05, 0.5),
        life: rng.range(40, 80),
        size: rng.range(4, 8),
        color: rng.next() < 0.5 ? 0x7fb51e : 0xa8dc30,
        kind: PKind.Dust,
      });
    }
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: e.x + rng.range(-1, 1),
        y: e.y - 1,
        vx: rng.range(-0.7, 0.7),
        vy: -rng.range(1.2, 2.8),
        life: rng.range(20, 40),
        size: 1,
        color: rng.next() < 0.3 ? 0xf0ff90 : 0xa8dc30,
        kind: PKind.Chunk,
      });
    }
    // the gas itself spreads through the fluid
    this.fluid.splat(e.x, e.y - 2, 8, 0, -0.6, 0, 0, 0.5);
    this.tintSky([0, 0.12, 0.3, 0.02], 0.35);
  }

  /**
   * Point lights for the frame (see lighting.ts): every glow lights the ground and tanks around
   * it, reaching further than the glow itself and fading over a little longer, in whole steps.
   */
  collectLights(lights: Lights, t: number): void {
    for (const g of this.glows) {
      const dur = g.dur * 4 + 16;
      const k = (t - g.start) / dur;
      if (k < 0 || k > 1) continue;
      // a bright pop, then the light dies down in whole steps, snapping off like the pixels
      const step = Math.floor(k * 6) / 6;
      const s = (k < 0.1 ? 1.4 : 1.1 * (1 - step)) * Math.min(1.4, g.strength);
      // fire light is warmer than the flash that casts it
      lights.add(g.x, g.y, Math.max(12, g.r * 2.2), s, warmLight(g.color));
    }
  }

  drawGlows(additive: QuadBatch, t: number): void {
    for (const g of this.glows) {
      const k = Math.max(0, (t - g.start) / g.dur);
      if (k > 1) continue;
      const a = (1 - k) * (1 - k) * g.strength;
      // hard-banded, cell-snapped blobs instead of smooth gradients (pixel look, §2a)
      const r = g.r * (0.55 + 0.45 * k);
      additive.push(g.x, g.y, r * 2, r * 2, g.color, 0.75 * a, Shape.Pixel);
      additive.push(g.x, g.y, r * 0.8, r * 0.8, 0xfff6e0, 0.9 * a, Shape.Pixel);
    }
  }

  /**
   * The ground is never quite still: each tick a few random columns of the surface shed what
   * they're made of. Grass lets go of seeds and pollen that ride the wind; bare dirt, sand and
   * ash lose grains when the wind picks up; snow blows spindrift off its crests; lava, magma
   * and cinder throw embers; water lifts a wisp of mist. All single-cell GPU motes.
   */
  private groundLife(t: number): void {
    const p = this.probe;
    const W = p.width;
    const H = p.height;
    const wind = this.wind;
    const gust = Math.min(1, Math.abs(wind) * 150);
    const dir = wind < 0 ? -1 : 1;
    // a handful of columns per tick, more in a wind
    const want = (W / 160) * (0.6 + gust * 1.6) * Math.max(0.3, this.mult);
    let n = Math.floor(want);
    const rng = new FxRng(Math.imul(t + 1, 2246822519) ^ 0x5bd1e995);
    if (rng.next() < want - n) n++;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rng.next() * W);
      const y = this.surfaceNear(x, H * 0.5, H * 0.5);
      if (y < 0) continue;
      const m = p.material(x, y);
      if (p.grass?.(x, y) && m !== 52 && m !== 19) {
        // seeds and pollen off the grass, more when the wind blows
        if (rng.next() > 0.25 + gust * 0.6) continue;
        const pollen = rng.next() < 0.6;
        this.particles.add({
          x: x + 0.5,
          y: y - 1,
          vx: dir * rng.range(0.1, 0.5) * (0.4 + gust) + rng.range(-0.1, 0.1),
          vy: -rng.range(0.08, 0.3),
          life: Math.round(rng.range(40, 110)),
          size: 1,
          color: pollen ? 0xf0e890 : 0xd8d0a0,
          kind: PKind.Ash,
        });
      } else if (m === 1 || m === 2 || m === 6 || m === 43 || m === 23) {
        // bare ground: grains hop downwind, only when the wind is up
        if (rng.next() > gust * 0.8 - 0.1) continue;
        this.particles.add({
          x: x + 0.5,
          y: y - 1,
          vx: dir * rng.range(0.4, 1.4) * gust,
          vy: -rng.range(0.1, 0.45),
          life: Math.round(rng.range(16, 40)),
          size: 1,
          color: shade(p.color(m), rng.range(1, 1.35)),
          kind: PKind.Chunk,
        });
      } else if (m === 52 || m === 41) {
        // snow and frost: spindrift streams off the surface
        if (rng.next() > 0.15 + gust * 0.8) continue;
        this.particles.add({
          x: x + 0.5,
          y: y - 1,
          vx: dir * rng.range(0.6, 1.8) * (0.3 + gust),
          vy: -rng.range(0.05, 0.3),
          life: Math.round(rng.range(20, 50)),
          size: 1,
          color: 0xffffff,
          kind: PKind.Flake,
        });
      } else if (m === 5 || m === 63 || m === 73) {
        // hot ground spits embers
        if (rng.next() > 0.5) continue;
        this.particles.add({
          x: x + 0.5,
          y: y - 1,
          vx: rng.range(-0.3, 0.3) + wind * 40,
          vy: -rng.range(0.3, 1.1),
          life: Math.round(rng.range(16, 44)),
          size: 1,
          color: rng.next() < 0.5 ? 0xffb040 : 0xff6020,
          kind: PKind.Ember,
        });
      } else if (m === 19) {
        // a wisp of mist off the water
        if (rng.next() > 0.3) continue;
        this.particles.add({
          x: x + 0.5,
          y: y - 1,
          vx: wind * 30,
          vy: -rng.range(0.04, 0.12),
          life: Math.round(rng.range(20, 40)),
          size: 1,
          color: 0xb8c8d8,
          kind: PKind.Ash,
        });
      }
    }
  }

  /**
   * What a bolt throws off as it lives: on the return stroke, sparks fly off the lower channel
   * and the foot kicks up embers, grit and dust; when the channel finally dies it crumbles into
   * cold motes that drift off along its path.
   */
  private boltBits(b: Bolt, t: number): void {
    const age = t - b.start;
    // ground arcs (no thickness set) crawl rather than strike: nothing to throw
    if (b.w === undefined || (age !== 1 && age !== b.dur)) return;
    const c = b.cells;
    const n = b.main;
    if (n < 4) return;
    const rng = new FxRng(b.seed + age);
    const s = b.w ?? 1;
    const fx = c[n - 2]!;
    const fy = c[n - 1]!;
    const top = c[1]!;
    const span = Math.max(1, fy - top);
    if (age === 1) {
      // sparks off the lower half of the channel, more the fatter the bolt
      const step = Math.max(2, Math.round(6 / s));
      for (let i = 0; i < n; i += 2 * step) {
        const k = (c[i + 1]! - top) / span;
        if (k < 0.45 || rng.next() > 0.7) continue;
        const dir = rng.next() < 0.5 ? -1 : 1;
        this.particles.add({
          x: c[i]! + 0.5,
          y: c[i + 1]! + 0.5,
          vx: dir * rng.range(0.6, 2.2),
          vy: rng.range(-1.2, 0.6),
          life: Math.round(rng.range(8, 18)),
          size: 1,
          color: rng.next() < 0.5 ? 0xffffff : 0xc8d8ff,
          kind: PKind.Spark,
        });
      }
      // the foot: a fan of grit and embers, and a puff of dust
      const m = Math.max(0.3, this.mult);
      const grit = Math.round(14 * s * m);
      for (let i = 0; i < grit; i++) {
        const a = rng.range(-2.4, -0.7);
        const sp = rng.range(1, 3.5) * s;
        this.particles.add({
          x: fx + rng.range(-2, 2),
          y: fy - 1,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: Math.round(rng.range(18, 40)),
          size: 1,
          color: rng.next() < 0.4 ? 0xffe0a0 : 0x8a6a48,
          kind: rng.next() < 0.55 ? PKind.Ember : PKind.Chunk,
        });
      }
      const dust = Math.round(3 * s);
      for (let i = 0; i < dust; i++) {
        const dir = i % 2 === 0 ? -1 : 1;
        this.particles.add({
          x: fx + dir * rng.range(1, 5),
          y: fy - 2,
          vx: dir * rng.range(0.3, 1),
          vy: rng.range(-0.6, -0.1),
          life: Math.round(rng.range(20, 36)),
          size: 4 + Math.round(rng.range(0, 3) * s),
          color: 0x9a8aa8,
          kind: PKind.Dust,
        });
      }
    } else {
      // the channel crumbles: cold motes let go along its path and drift off
      for (let i = 0; i < n; i += 4) {
        if (rng.next() > 0.6) continue;
        this.particles.add({
          x: c[i]! + 0.5,
          y: c[i + 1]! + 0.5,
          vx: rng.range(-0.4, 0.4),
          vy: rng.range(-0.3, 0.3),
          life: Math.round(rng.range(10, 26)),
          size: 1,
          color: rng.next() < 0.3 ? 0xd0e0ff : 0x7090e0,
          kind: PKind.Glitter,
        });
      }
    }
  }

  /**
   * Lightning channels: a stepped leader feels its way down dim, then the white return stroke,
   * restrikes with dark gaps between, and the channel gutters out in whole steps with branches
   * dropping out one by one.
   */
  drawBolts(additive: QuadBatch, t: number): void {
    for (const b of this.bolts) {
      const age = t - b.start;
      if (age < 0 || age > b.dur) continue;
      let fade: number;
      if (age < BOLT_FLICK.length) fade = BOLT_FLICK[age]!;
      else {
        // guttering: a falling level with a per-tick stutter, in hard steps
        const left = Math.max(
          0,
          1 - (age - BOLT_FLICK.length + 1) / Math.max(1, b.dur - BOLT_FLICK.length + 1),
        );
        const h = (Math.imul(age + 1, 374761393) ^ (b.seed | 0)) >>> 0;
        fade = (h & 3) === 0 ? 0 : Math.round(left * 0.6 * 4) / 4;
      }
      if (fade <= 0) continue;
      const c = b.cells;
      const s = b.w ?? 1;
      const core = Math.max(1, Math.round(s) * 2 - 1);
      // the leader (age 0) has only reached partway down and shows no branches yet
      const leaderEnd = age === 0 ? b.main * 0.7 : Number.POSITIVE_INFINITY;
      for (let i = 0; i < c.length; i += 2) {
        const branch = i >= b.main;
        if (i >= leaderEnd) break;
        if (branch && age > 1) {
          // each flash lights a different set of branches; late in the life most are gone
          const h =
            (Math.imul((i >> 4) + 1, 2246822519) ^
              Math.imul(age + 1, 3266489917) ^
              (b.seed | 0)) >>>
            0;
          if (((h >>> 8) & 255) / 255 > (age < BOLT_FLICK.length ? 0.75 : 0.35)) continue;
        }
        const x = c[i]! + 0.5;
        const y = c[i + 1]! + 0.5;
        if (branch) {
          additive.push(x, y, Math.round(3 * s), s > 1.5 ? 2 : 1, 0x4060c0, 0.4 * fade);
          additive.push(x, y, Math.round(s), 1, 0xb0c8ff, 0.75 * fade);
        } else {
          // the main channel: a 3-cell white core inside a 7-cell blue halo
          additive.push(x, y, Math.round(7 * s), s > 1.5 ? 2 : 1, 0x3050c0, 0.45 * fade);
          additive.push(x, y, Math.round(3 * s), 1, 0xd0e0ff, 0.9 * fade);
          additive.push(x, y, core, 1, 0xffffff, fade);
        }
      }
    }
  }

  /**
   * Frost starbursts: ice spikes that shoot out from the impact in the first ticks (drawn up to a
   * growing length along each spike), hold, then shatter away from the tips in whole steps.
   */
  drawCrystals(additive: QuadBatch, t: number): void {
    for (const b of this.crystals) {
      const age = t - b.start;
      if (age < 0 || age > b.dur) continue;
      const c = b.cells;
      const n = c.length;
      // shoot out over 5 ticks, hold, then shatter: tips first, then random cells drop out
      const reach = b.len * Math.min(1, (age + 1) / 5);
      const fade = age < 12 ? 1 : 1 - (age - 12) / (b.dur - 12);
      const tip = b.len * Math.max(0, fade);
      for (let i = 0; i < n; i += 2) {
        const dx = c[i]! - b.x;
        const dy = c[i + 1]! - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > reach || d > tip + 2) continue;
        const h = ((c[i]! * 73856093) ^ (c[i + 1]! * 19349663)) >>> 0;
        if (fade < 1 && ((h >>> 8) & 255) / 255 > fade + 0.3) continue;
        const x = c[i]! + 0.5;
        const y = c[i + 1]! + 0.5;
        additive.push(x, y, 3, 3, 0x5ea8dc, 0.45 * fade);
        additive.push(x, y, 1, 1, (h & 7) === 0 ? 0xffffff : 0xd6f0ff, fade);
      }
    }
  }

  /** Glue domes slumping into puddles, then the strings of glue over them. */
  drawGoo(normal: QuadBatch, t: number): void {
    for (const s of this.splats) {
      const age = t - s.start;
      if (age < 0 || age > s.dur) continue;
      const k = age / s.dur;
      // swells up in a few ticks, wobbles (hard steps), then slumps flat and wide
      const grow = Math.min(1, (age + 1) / 4);
      const wob = age < 24 ? (((age >> 2) & 1) === 0 ? 1.18 : 0.86) : 1;
      const hgt = Math.max(1, Math.round(s.r * 0.75 * grow * wob * (1 - 0.8 * k)));
      const wid = s.r * grow * (1 + 0.6 * k) * (wob > 1 ? 0.92 : 1.08);
      for (let j = 0; j < hgt; j++) {
        const f = j / hgt;
        const half = Math.round(wid * Math.sqrt(1 - f * f));
        if (half <= 0) continue;
        const row = Math.floor(s.y) - 1 - j;
        // fading out: rows drop away from the top down in a hashed dither
        if (k > 0.75) {
          const h = (Math.imul(row + 3, 2654435761) ^ Math.imul(s.start + 1, 40503)) >>> 24;
          if (h / 255 < (k - 0.75) * 4 * (0.4 + f)) continue;
        }
        const col = f > 0.7 ? GLUE[0] : f > 0.35 ? GLUE[1] : j === 0 ? GLUE[3] : GLUE[2];
        normal.rect(Math.floor(s.x) - half, row, half * 2 + 1, 1, col);
      }
      // a lit glint high on the dome's shoulder while it is still round
      if (hgt > 3) normal.rect(Math.floor(s.x) - (hgt >> 1), Math.floor(s.y) - hgt, 1, 1, 0xffffff);
    }
    for (const st of this.strands) {
      const age = t - st.start;
      if (age < 0) continue;
      const dx = st.hx - st.ax;
      const dy = st.hy - st.ay;
      const n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
      // sags more the longer it hangs; the middle necks thin just before it snaps
      const sag = Math.min(6, age * 0.25) * Math.min(1, n / 12);
      const neck = age > st.life * 0.7;
      for (let i = 0; i <= n; i++) {
        const u = n === 0 ? 0 : i / n;
        if (neck && u > 0.4 && u < 0.6 && (i & 1) === 0) continue;
        const x = Math.floor(st.ax + dx * u);
        const y = Math.floor(st.ay + dy * u + sag * 4 * u * (1 - u));
        normal.rect(x, y, 1, 1, i % 6 === 2 ? GLUE[1] : GLUE[2]);
      }
      // the gob on the end
      normal.rect(Math.floor(st.hx) - 1, Math.floor(st.hy) - 1, 2, 2, GLUE[1]);
      normal.rect(Math.floor(st.hx) - 1, Math.floor(st.hy) - 1, 1, 1, GLUE[0]);
    }
  }

  /** Low quality has no distortion pass: draw ripples as plain rings instead. */
  drawRippleRings(additive: QuadBatch, t: number): void {
    for (const r of this.ripples) {
      const k = (t - r.start) / r.dur;
      if (k < 0 || k > 1 || r.column) continue;
      const rad = r.maxR * Math.sqrt(k);
      additive.push(
        r.x,
        r.y,
        rad * 2.35,
        rad * 2.35,
        0xb0d0ff,
        0.35 * (1 - k) * r.strength,
        Shape.Ring,
      );
      // (low quality only; medium/high get the cell-snapped refraction pass)
    }
  }

  clear(): void {
    this.ripples = [];
    this.glows = [];
    this.fronts = [];
    this.bolts = [];
    this.jets = [];
    this.crystals = [];
    this.mushrooms = [];
    this.lances.clear();
    this.ions.clear();
    this.chunks.clear();
    this.vortices = [];
    this.funnels = [];
    this.strands = [];
    this.splats = [];
    this.posts = [];
    this.magnets = [];
    this.wells = [];
    this.holes = [];
    this.novas = [];
    this.kaijus = [];
    this.portals = [];
    this.columns.length = 0;
    this.shakeAmp = 0;
    this.shakeDur = SHAKE_MIN;
    this.skyFlash = 0;
    this.sky[0] = this.sky[1] = this.sky[2] = 0;
    this.split = 0;
  }
}

/** Ticks without a bounce after which the Ricochet Ball counts as cooled (a new shot). */
const RICOCHET_GAP = 240;

/** Ricochet Ball colour per heat (bounces so far): cold cyan climbing to white-hot. */
export const RICOCHET_HEAT = [
  0x50e8ff, 0x70b0ff, 0x9a80ff, 0xd070ff, 0xff68c8, 0xffb0f0, 0xffffff,
] as const;

/**
 * Zone looks by index (gas, acid, resonance, toxic, volcano, storm), matching the sim's zone
 * `look` order.
 */
export const ZONE_COLOR = [0x9ab83a, 0xb8f040, 0xb070ff, 0x8cc425, 0x3a2f2c, 0x3c4250] as const;

/** Rust bands (Thunderstorm): dark pit, body, orange, lit edge. */
export const RUST = [0x5a2a14, 0x8e4a1e, 0xb8642a, 0xd88a44] as const;

/** Append the cells of a grid line (Bresenham) from (x0,y0) to (x1,y1), excluding the start. */
function line(x0: number, y0: number, x1: number, y1: number, out: number[]): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    out.push(x, y);
  }
}
