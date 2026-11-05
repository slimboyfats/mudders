import type { DamageType, ZodType } from '@mudders/shared';
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
  /**
   * Knock a cell loose as a sim debris particle (fixed-point position and velocity). The cell is
   * cleared from the grid and becomes terrain again where the particle lands. Returns false (and
   * leaves the cell alone) if the debris pool is full.
   */
  launch(cellIndex: number, vx: number, vy: number): boolean;
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

export interface FlightBehaviour<P = unknown> extends BehaviourBase<P> {
  readonly kind: 'flight';
  /** Max lifetime in ticks, from params. */
  maxTicks(params: P): number;
  /** Advance one tick: update velocity and position. Collision is the kernel's job. */
  step(api: SimApi, p: Projectile, params: P): void;
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

export interface ModeApi {
  readonly rng: Prng;
  readonly players: number;
  alive(player: number): boolean;
  /** Turns taken this round. */
  turn(): number;
  /** Set wind, fixed-point cells/tick². */
  setWind(fixedWind: number): void;
  readonly windMax: number;
  readonly windType: 'none' | 'constant' | 'perTurn';
}

export interface ModeBehaviour<P = unknown> extends BehaviourBase<P> {
  readonly kind: 'mode';
  /** Player order for the round. */
  turnOrder(api: ModeApi, params: P): number[];
  onRoundStart(api: ModeApi, params: P): void;
  onTurnStart(api: ModeApi, params: P): void;
}

export type AnyBehaviour =
  GeneratorBehaviour | FlightBehaviour | TerrainOpBehaviour | ModeBehaviour;

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
