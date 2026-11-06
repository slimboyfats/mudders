import type { DamageType, WindType, ZodType } from '@mudders/shared';
import type { DebrisPool } from './debris';
import type { Grid } from './grid';
import type { MaterialTable } from './materials';
import type { Prng } from './prng';
import type { Scratch } from './scratch';

/**
 * Behaviour modules: the code half of content (§2c.1). Content packages register these; the
 * kernel only knows the interfaces, never a specific behaviour. Each module validates its own
 * manifest parameters with `params` and receives only the grid API and the match RNG.
 *
 * `version` is part of the content hash: bump it whenever the behaviour's results change.
 */

export interface EffectSink {
  emit(type: string, x: number, y: number, radius: number, params?: Record<string, number>): void;
}

/** Mutable tank view handed to behaviours that may shove tanks. */
export interface TankHandle {
  readonly player: number;
  readonly alive: boolean;
  /** Hitbox half-width and height in cells (they differ per tank type). */
  readonly half: number;
  readonly h: number;
  x: number;
  y: number;
}

/** Everything a behaviour may touch. No time, no DOM, no renderer. */
export interface SimApi extends EffectSink {
  readonly grid: Grid;
  readonly mats: MaterialTable;
  readonly rng: Prng;
  readonly tick: number;
  readonly scratch: Scratch;
  readonly tanks: readonly TankHandle[];
  /** Wind in fixed-point cells/tick². */
  readonly wind: number;
  /** Gravity in fixed-point cells/tick². */
  readonly gravity: number;
  /** Air drag from the weather: fixed-point share of a shell's velocity lost per tick (0 = none). */
  readonly drag: number;
  /**
   * Knock a cell loose as a sim debris particle (fixed-point position and velocity). The cell is
   * cleared from the grid and becomes terrain again where the particle lands. Returns false (and
   * leaves the cell alone) if the debris pool is full.
   */
  launch(cellIndex: number, vx: number, vy: number): boolean;
  /**
   * Sim debris in flight. A behaviour may steer particles (change `vx`/`vy`, fixed-point) but must
   * not add, remove or reorder them; `launch` is the only way in.
   */
  readonly debris: DebrisPool;
  /**
   * Carry a tank through the air this tick: it is put at column `x`, bottom row `y`, and does not
   * fall this tick. Once a behaviour stops holding it, it falls from there, and fall damage counts
   * from the highest row it was carried to. Ignored for dead tanks.
   */
  hold(player: number, x: number, y: number): void;
}

interface BehaviourBase<P> {
  readonly id: string;
  readonly version: number;
  /** Validates the manifest's parameter keys (everything except id/meta/behaviour/ref). */
  readonly params: ZodType<P>;
}

// ── generators ──────────────────────────────────────────────────────────────────────────────

export interface GenResult {
  /** Spawn column per player. */
  spawns: number[];
  /**
   * Per map column, the first row a tank may spawn at (default 0, the top). A map with a roof
   * (caves) sets it below the roof, so tanks start on the floor beneath it, not on top.
   */
  spawnFrom?: Int32Array;
  /**
   * Glue every cell of a material into one group with the rules of a prop's first group (see
   * `Groups.glue`), e.g. a cave roof that drops whatever is cut off from it.
   */
  glue?: { prop: string; material: string }[];
}

export interface GeneratorBehaviour<P = unknown> extends BehaviourBase<P> {
  readonly kind: 'gen';
  generate(api: SimApi, params: P, players: number): GenResult;
}

// ── flights ─────────────────────────────────────────────────────────────────────────────────

/** Projectile state; positions and velocities in fixed-point cells. */
export interface Projectile {
  id: number;
  weapon: number;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  alive: boolean;
  /** Behaviour-owned integers (bounce counters, homing target…), hashed with the state. */
  data: number[];
}

/**
 * What a flight asks the kernel to do this tick:
 * - `impact`: go off here (run the weapon's impacts at the shell's position).
 * - `pulse`: run the weapon's `pulse` impacts here and keep flying (before collision is checked,
 *   so a digger's pulse clears its own way).
 * - `skip`: moved without crossing the space between (a teleport): no collision check this tick.
 * - `die`: vanish without going off.
 * - nothing: fly on; the kernel traces the move and handles any hit.
 */
export type FlightSignal = 'impact' | 'pulse' | 'skip' | 'die' | undefined;

/**
 * A hit the kernel's tracer found between the shell's old and new position. `x`,`y` is the first
 * cell hit; `freeX`,`freeY` the last free cell before it; `tank` the player hit (or -1).
 */
export interface FlightHit {
  x: number;
  y: number;
  freeX: number;
  freeY: number;
  tank: number;
}

/**
 * What to do about a hit: `impact` (go off at the hit cell, the default), `pulse` (run the pulse
 * impacts at the hit cell and keep going), `continue` (keep going; the behaviour has already put
 * the shell where it wants it), or `die`.
 */
export type ContactResult = 'impact' | 'pulse' | 'continue' | 'die';

export interface FlightBehaviour<P = unknown> extends BehaviourBase<P> {
  readonly kind: 'flight';
  /** Max lifetime in ticks, from params. */
  maxTicks(params: P): number;
  /** Advance one tick: update velocity and position. Collision is the kernel's job. */
  step(api: SimApi, p: Projectile, params: P): FlightSignal;
  /** Called on a hit; without it every hit is an `impact`. */
  contact?(api: SimApi, p: Projectile, params: P, hit: FlightHit): ContactResult;
}

// ── terrain ops ─────────────────────────────────────────────────────────────────────────────

export interface OpCall {
  x: number;
  y: number;
  radius: number;
  damageType: DamageType;
  /** Index into the material table's damage types. */
  damageTypeIndex: number;
  owner: number;
}

/** A running op (§4a): plain integers only, so it hashes and snapshots trivially. */
export interface OpInstance {
  op: number;
  call: OpCall;
  t: number;
  data: number[];
}

export interface TerrainOpBehaviour<P = unknown> extends BehaviourBase<P> {
  readonly kind: 'terrainop';
  /** Apply the op. Return state to continue over later ticks, or null if finished. */
  start(api: SimApi, params: P, call: OpCall): number[] | null;
  /** Continue a multi-tick op. Return false when finished. */
  step?(api: SimApi, params: P, inst: OpInstance): boolean;
}

// ── modes ───────────────────────────────────────────────────────────────────────────────────

export interface ModeApi extends EffectSink {
  readonly rng: Prng;
  /** The match tick (for timing things like gusts). */
  now(): number;
  readonly players: number;
  alive(player: number): boolean;
  /** Team of a player (milestone 7); the player number in a free-for-all. */
  team(player: number): number;
  /** Turns taken this round. */
  turn(): number;
  /** Set the turn's wind (the base the gusts blow around), fixed-point cells/tick². */
  setWind(fixedWind: number): void;
  /**
   * Set the gust on top of the base wind, fixed-point cells/tick². The world's wind is base + gust;
   * bots aim with the base (they can't see the next gust coming either).
   */
  setGust(fixedGust: number): void;
  readonly windMax: number;
  readonly windType: WindType;
  /**
   * Numbers the mode keeps between ticks (gust state, say). Hashed, reset by nothing: the mode owns
   * it. Starts empty.
   */
  readonly memory: number[];
}

export interface ModeBehaviour<P = unknown> extends BehaviourBase<P> {
  readonly kind: 'mode';
  /** Player order for the round. */
  turnOrder(api: ModeApi, params: P): number[];
  onRoundStart(api: ModeApi, params: P): void;
  onTurnStart(api: ModeApi, params: P): void;
  /** Every tick of aiming and resolving (not the shop), before shells move. */
  onTick?(api: ModeApi, params: P): void;
}

// ── AI personalities ────────────────────────────────────────────────────────────────────────

export interface AiTankView {
  readonly player: number;
  /** Team (milestone 7); the player number in a free-for-all. Bots never aim at their own team. */
  readonly team: number;
  readonly alive: boolean;
  readonly x: number;
  readonly y: number;
  readonly health: number;
  /** Shield points left (Bulwark), soaked before health. */
  readonly shield: number;
  /** Health at round start (a battery heals up to it). */
  readonly maxHealth: number;
  /** Half-width and height of the hitbox, in cells. */
  readonly half: number;
  readonly h: number;
}

/** A place a tank can stand: centre column and the row it stands on. */
export interface AiSpot {
  readonly x: number;
  readonly y: number;
}

/** A weapon the bot owns (count ≠ 0), by index into the world's weapon table. */
export interface AiWeaponView {
  readonly index: number;
  readonly id: string;
  /** -1 = unlimited. */
  readonly count: number;
  readonly expectedDamage: number;
  readonly terrainValue: number;
}

/** Where a shot would land if nothing moved: map cell, tank hit (-1 none), flight ticks. */
export interface ShotPrediction {
  x: number;
  y: number;
  tank: number;
  ticks: number;
  /** False when the shell left the map or timed out. */
  landed: boolean;
}

export interface AiShot {
  weapon: number;
  angle: number;
  power: number;
}

/** What a bot may look at when aiming. Read-only except `memory` (hashed, persists all match). */
/** A piece of gear I carry (§5.1). */
export interface AiGearView {
  /** Index to return from `AiBehaviour.gear`. */
  readonly index: number;
  readonly id: string;
  readonly deploy: 'manual' | 'fall';
  /** Shield points it raises my shield to, and health it restores. */
  readonly shield: number;
  readonly heal: number;
  readonly count: number;
  /** Switching it on now would change something (and I have one). */
  readonly useful: boolean;
}

export interface AiApi {
  readonly rng: Prng;
  readonly me: number;
  readonly tanks: readonly AiTankView[];
  readonly weapons: readonly AiWeaponView[];
  /** Every gear item, in id order, with how many I carry. */
  readonly gear: readonly AiGearView[];
  readonly width: number;
  readonly height: number;
  /** Fixed-point cells/tick². */
  readonly wind: number;
  readonly gravity: number;
  /** Cells per tick at power 1000, fixed-point. */
  readonly maxSpeed: number;
  surfaceY(x: number): number;
  /**
   * Simulate a shell of `weapon` from my barrel through the current terrain, from where I stand or
   * from `from` (a spot from `reach`). A frosted tank's power cap applies, as it does when firing.
   */
  predict(weapon: number, angle: number, power: number, from?: AiSpot): ShotPrediction;
  /** Drive fuel left (one unit per cell). */
  readonly fuel: number;
  /** Cells I may still drive this turn (the tank type's allowance), before fuel. */
  readonly driveLeft: number;
  /**
   * The spots I can drive to this turn in direction `dir`, nearest first: what driving would do
   * cell by cell (steps up to the mode's climb), limited by `driveLeft` and `fuel`, and ending
   * before any drop deep enough to hurt (short drops are fine).
   */
  reach(dir: -1 | 1): readonly AiSpot[];
  /** Own turns left frosted; while > 0 shells fire at no more than CHILL_POWER. */
  readonly chill: number;
  /** My previous shot this round, or null. */
  readonly lastShot: {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly power: number;
  } | null;
  readonly memory: number[];
  readonly angle: number;
  readonly power: number;
}

export interface AiShopItem {
  readonly index: number;
  readonly id: string;
  readonly price: number;
  readonly pack: number;
  readonly tier: number;
  readonly count: number;
  readonly expectedDamage: number;
  readonly terrainValue: number;
}

export interface AiShopApi {
  readonly rng: Prng;
  readonly me: number;
  readonly money: number;
  /** Rounds played so far. */
  readonly round: number;
  readonly items: readonly AiShopItem[];
  /** Drive fuel I have, the most I may hold, and what one pack adds and costs (§3.2). */
  readonly fuel: number;
  readonly fuelMax: number;
  readonly fuelPack: number;
  readonly fuelPrice: number;
  /** Cells my tank type may drive per turn. */
  readonly driveCells: number;
  /** My full health (round start). */
  readonly health: number;
  /** Gear for sale (fixed prices), with how many I carry and the most I may. */
  readonly gear: readonly AiShopGear[];
}

export interface AiShopGear {
  readonly index: number;
  readonly id: string;
  readonly deploy: 'manual' | 'fall';
  readonly shield: number;
  readonly heal: number;
  readonly price: number;
  readonly pack: number;
  readonly max: number;
  readonly count: number;
}

/** `item` value of a purchase that buys fuel packs instead of a weapon. */
export const AI_FUEL = -1;

/**
 * One shop purchase: `packs` of the weapon at index `item`, of fuel when `item` is AI_FUEL, or of
 * the gear at index `item` when `gear` is true.
 */
export interface AiPurchase {
  item: number;
  packs: number;
  gear?: boolean;
}

export interface AiBehaviour<P = unknown> extends BehaviourBase<P> {
  readonly kind: 'ai';
  /**
   * Optional, before aiming: the column to drive to this turn. It must be one of the spots
   * `reach` offers (anything else, or my own column, means stay); the kernel drives there cell by
   * cell like a human holding the drive button, then the bot aims from where it stopped.
   */
  move?(api: AiApi, params: P): number;
  /**
   * Optional, just before aiming: gear indexes to switch on this turn (shield, battery), in order.
   * The kernel validates each use as it would a human's; using gear never ends the turn.
   */
  gear?(api: AiApi, params: P): number[];
  aim(api: AiApi, params: P): AiShot;
  /** Purchases in order; the kernel validates each as it would a human's. */
  shop(api: AiShopApi, params: P): AiPurchase[];
}

// ── weather ─────────────────────────────────────────────────────────────────────────────────

/**
 * Match weather (`weather.*`): rain soaking the ground, snow piling up. Called at the start of every
 * turn (after the mode) and every tick of aiming and resolving. It may change cells (marking them
 * dirty so they settle), draw from the match RNG and emit effect events.
 */
export interface WeatherBehaviour<P = unknown> extends BehaviourBase<P> {
  readonly kind: 'weather';
  onTurnStart?(api: SimApi, params: P): void;
  onTick?(api: SimApi, params: P): void;
}

export type AnyBehaviour =
  | GeneratorBehaviour
  | FlightBehaviour
  | TerrainOpBehaviour
  | ModeBehaviour
  | AiBehaviour
  | WeatherBehaviour;

export type BehaviourKind = AnyBehaviour['kind'];

/** Typed helpers so content modules get their params type inferred from the schema. */
export function defineGenerator<P>(b: GeneratorBehaviour<P>): GeneratorBehaviour {
  return b as unknown as GeneratorBehaviour;
}
export function defineFlight<P>(b: FlightBehaviour<P>): FlightBehaviour {
  return b as unknown as FlightBehaviour;
}
export function defineTerrainOp<P>(b: TerrainOpBehaviour<P>): TerrainOpBehaviour {
  return b as unknown as TerrainOpBehaviour;
}
export function defineMode<P>(b: ModeBehaviour<P>): ModeBehaviour {
  return b as unknown as ModeBehaviour;
}
export function defineAi<P>(b: AiBehaviour<P>): AiBehaviour {
  return b as unknown as AiBehaviour;
}
export function defineWeather<P>(b: WeatherBehaviour<P>): WeatherBehaviour {
  return b as unknown as WeatherBehaviour;
}

/** Behaviours by id. Lookup only; never iterated where order matters (ids are sorted on export). */
export class BehaviourRegistry {
  private readonly byId: Record<string, AnyBehaviour> = {};

  constructor(behaviours: readonly AnyBehaviour[] = []) {
    for (const b of behaviours) this.register(b);
  }

  register(b: AnyBehaviour): void {
    if (Object.hasOwn(this.byId, b.id)) throw new Error(`behaviour ${b.id} registered twice`);
    this.byId[b.id] = b;
  }

  get(id: string): AnyBehaviour | undefined {
    return Object.hasOwn(this.byId, id) ? this.byId[id] : undefined;
  }

  getKind<K extends BehaviourKind>(id: string, kind: K): Extract<AnyBehaviour, { kind: K }> {
    const b = this.get(id);
    if (!b) throw new Error(`no behaviour registered for ${id}`);
    if (b.kind !== kind) throw new Error(`behaviour ${id} is a ${b.kind}, expected ${kind}`);
    return b as Extract<AnyBehaviour, { kind: K }>;
  }

  /** Sorted by id. */
  list(): AnyBehaviour[] {
    return Object.keys(this.byId)
      .sort()
      .map((k) => this.byId[k]!);
  }
}
