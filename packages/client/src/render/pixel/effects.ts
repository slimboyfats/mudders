import type { EffectEvent } from '@mudders/shared';
import type { Quality } from '../types';
import { Shape, type QuadBatch } from './batch';
import { drawPost, makePost, type Post } from './bumper';
import { FxRng } from './gl';
import { blastShake, SHAKE_MIN, shakeTicks } from '../impact';
import { Lances } from './lance';
import { drawMagnet, type MagnetFx } from './magnet';
import { drawMushroom, makeMushroom, type Mushroom } from './mushroom';
import { PKind, type Particles } from './particles';
import { shade } from './theme';
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
}

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

/** Mud tones for geyser columns and splats: deep, body, lit, wet sheen. */
const MUD = [0x4a3f2a, 0x6e6046, 0x8f7f5a, 0xbcae86] as const;
/** Steam puffs over a geyser. */
const STEAM = [0xd0c8b8, 0xb0a898, 0x8c8474] as const;

interface Bolt {
  /** Cells of the jagged path, x0,y0,x1,y1,… (main channel then branches). */
  cells: Int32Array;
  /** Where the main channel ends in `cells` (branches after are drawn dimmer). */
  main: number;
  start: number;
  dur: number;
}

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

export const QUALITY_PARTICLES: Record<Quality, { cap: number; mult: number }> = {
  low: { cap: 800, mult: 0.35 },
  medium: { cap: 2500, mult: 0.7 },
  high: { cap: 6000, mult: 1 },
};

/** Reads terrain for effects (e.g. chunk colour); renderer-provided. */
export interface TerrainProbe {
  material(x: number, y: number): number;
  color(material: number): number;
  width: number;
  height: number;
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
  /** Chromatic split in cells (nukes), decaying. */
  split = 0;
  mult = 1;
  /** Orbital Lance lock-ons and beams. */
  readonly lances: Lances;
  /**
   * Ricochet Ball heat: bounces of the ball in flight (0 = fresh), from its `ricochet` events.
   * Only one shot flies at a time, so a single counter is enough; it resets on the final burst
   * or after a long gap.
   */
  ricochetHeat = 0;
  private ricochetLast = -1000;

  constructor(
    private readonly particles: Particles,
    private readonly probe: TerrainProbe,
  ) {
    this.lances = new Lances(particles);
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
        });
        break;
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
      case 'pocketBurst':
        this.pocketBurst(e);
        break;
      case 'zoneHurt':
        this.puff(e, 0xb8f040, 8);
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
    this.mushrooms = this.mushrooms.filter((m) => drawMushroom(m, normal, additive, t));
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

  /** A jagged lightning channel from the top of the map down to (x, y), with a branch or two. */
  private bolt(e: EffectEvent): void {
    const rng = this.rngFor(e, 29);
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
    walk(e.x + Math.round(rng.range(-18, 18)), 0, e.y, 0);
    const fixX = e.x - pts[pts.length - 2]!;
    for (let i = 0; i < pts.length; i += 2) {
      const k = pts[i + 1]! / Math.max(1, e.y);
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
    this.bolts.push({ cells: Int32Array.from(pts), main, start: e.tick, dur: 20 });
    this.glows.push({
      x: e.x,
      y: e.y,
      r: 26,
      start: e.tick,
      dur: 14,
      color: 0xc8d8ff,
      strength: 1.4,
    });
    // the whole sky blinks white-blue
    this.tintSky([0, 0.75, 0.8, 1], 0.5);
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
    const rng = this.rngFor(e, 1);
    const r = Math.max(4, e.radius);
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

  /** Advance continuing effects by one tick (called once per sim tick, in tick order). */
  tick(t: number): void {
    this.feedJets(t);
    this.tickStrands(t);
    this.fireworkTick(t);
    // shockwave fronts: dust and grit kicked up along the ground as the ring passes
    this.fronts = this.fronts.filter((f) => {
      const k = (t - f.start) / f.dur;
      if (k > 1) return false;
      const r = f.maxR * k;
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
    this.ripples = this.ripples.filter((r) => t - r.start <= r.dur);
    this.glows = this.glows.filter((g) => t - g.start <= g.dur);
    this.bolts = this.bolts.filter((b) => t - b.start <= b.dur);
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
    for (let i = 0; i < 6; i++) {
      this.particles.add({
        x: e.x + rng.range(-3, 3),
        y: e.y - 2,
        vx: rng.range(-0.2, 0.2),
        vy: -rng.range(0.4, 0.9),
        life: rng.range(40, 70),
        size: rng.range(4, 7),
        color: 0x6a9a1a,
        kind: PKind.Smoke,
      });
    }
    this.tintSky([0, 0.12, 0.3, 0.02], 0.35);
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

  /** Lightning channels: a white core with a cold halo, flickering out in whole steps. */
  drawBolts(additive: QuadBatch, t: number): void {
    for (const b of this.bolts) {
      const age = t - b.start;
      if (age < 0 || age > b.dur) continue;
      // on, off, on, then fading: the classic double strike
      const on = age < 3 || (age >= 4 && age < 6) || (age >= 8 && age < 10) || age >= 11;
      if (!on) continue;
      const fade = age < 11 ? 1 : Math.max(0, 1 - (age - 11) / Math.max(1, b.dur - 11));
      const c = b.cells;
      for (let i = 0; i < c.length; i += 2) {
        const branch = i >= b.main;
        const x = c[i]! + 0.5;
        const y = c[i + 1]! + 0.5;
        if (branch) {
          additive.push(x, y, 3, 1, 0x4060c0, 0.4 * fade);
          additive.push(x, y, 1, 1, 0xb0c8ff, 0.75 * fade);
        } else {
          // the main channel: a 3-cell white core inside a 7-cell blue halo
          additive.push(x, y, 7, 1, 0x3050c0, 0.45 * fade);
          additive.push(x, y, 3, 1, 0xd0e0ff, 0.9 * fade);
          additive.push(x, y, 1, 1, 0xffffff, fade);
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
      if (k < 0 || k > 1) continue;
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
    this.vortices = [];
    this.funnels = [];
    this.strands = [];
    this.splats = [];
    this.posts = [];
    this.magnets = [];
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
 * Zone looks by index (gas, acid, resonance, toxic, volcano), matching the sim's zone `look`
 * order.
 */
export const ZONE_COLOR = [0x9ab83a, 0xb8f040, 0xb070ff, 0x8cc425, 0x3a2f2c] as const;

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
