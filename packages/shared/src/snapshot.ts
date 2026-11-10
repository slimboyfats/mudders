/**
 * Renderer-facing types (§2a, §2b). The sim emits a read-only snapshot per tick; renderers consume
 * this and nothing else.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Renderer-agnostic effect events. Fire-and-forget: a renderer that drops one still sees the same
 * sim state. Unknown types are ignored by renderers.
 */
export interface EffectEvent {
  type: string;
  tick: number;
  x: number;
  y: number;
  radius: number;
  /** Free-form numeric parameters from the effect profile (strength, colour index, …). */
  params: Readonly<Record<string, number>>;
}

export interface TankView {
  kind: 'tank';
  player: number;
  /** Map coordinates: x is the centre column, y the row the tank stands on. */
  x: number;
  y: number;
  angle: number;
  health: number;
  /** Health at round start, for health bars (100 for the standard tank). */
  maxHealth: number;
  /** Shield points left, and the most it held this round (0 = no shield). */
  shield: number;
  maxShield: number;
  /** A parachute is open: the tank is drifting down (gear with `deploy: "fall"`). */
  chute: boolean;
  /** Tank type id (`tank.*`), or '' for the built-in standard tank; picks the renderer's sprite. */
  tank: string;
  alive: boolean;
  /** Power 0–1000 (for aim previews). */
  power: number;
  /** Own turns left frosted (0 = not): its shots fire at no more than half power. */
  chill: number;
  /** Own turns left glued (0 = not): it can't drive and nothing shoves it sideways. */
  glue: number;
  /** Own turns left rusted (0 = not, Thunderstorm): it bleeds health, drives less, shots wobble. */
  rust?: number;
  /** Own turns left mind-controlled (Telepathy), and by which player; absent when free. */
  mind?: number;
  mindBy?: number;
  /** Own turns left jammed (0/absent = not, Shield Breaker EMP): no driving, no gear. */
  jam?: number;
  /** Marker's turns left spotted (Spotter Flare), and the player who marked it. */
  mark?: number;
  markBy?: number;
  /** Own turns left with a full-arc aim preview (Spotter Flare). */
  scope?: number;
  /** True while this tank's player is aiming. */
  active: boolean;
}

export interface ProjectileView {
  kind: 'projectile';
  id: number;
  weapon: string;
  /** Sub-pixel map coordinates. */
  x: number;
  y: number;
}

/** A lingering zone (§4a): gas cloud, acid haze or resonance field. */
export interface ZoneView {
  kind: 'zone';
  x: number;
  y: number;
  radius: number;
  look: 'gas' | 'acid' | 'resonance' | 'toxic' | 'volcano' | 'storm' | 'caltrops' | 'acid-cloud';
  /** Turns left. */
  turns: number;
  /** Gas clouds: each puff's centre in cells, flattened x, y (empty for a fixed zone). */
  puffs?: number[];
  /** Gas clouds: puff radius in cells. */
  puffRadius?: number;
  /** Gas clouds and sky zones (storms): ticks since the zone was laid. */
  age?: number;
}

/** A mine waiting on the ground (§4a). */
export interface MineView {
  kind: 'mine';
  /** Stable while the mine lives (renderers key animations on it). */
  id: number;
  x: number;
  y: number;
  /** Trip radius in cells. */
  radius: number;
  look: 'black-hole' | 'tripwire';
  armed: boolean;
  owner: number;
  /** Tripwire: the second post's foot (the first is `x`, `y`) and the wire's height above both. */
  wire?: { x2: number; y2: number; height: number };
}

/** A decoy (Decoy Tank): a dummy tank in its owner's colours. */
export interface DecoyView {
  kind: 'decoy';
  /** Stable for the round. */
  id: number;
  x: number;
  /** Bottom row. */
  y: number;
  owner: number;
  hp: number;
  maxHp: number;
}

export type EntityView = TankView | ProjectileView | ZoneView | MineView | DecoyView;

/**
 * How much of each ongoing process the world holds right now, for the soundscape (§8b): the
 * crackle, bubbling, trickle and hiss loops get louder the more there is. Counts, not 0–1 levels.
 */
export interface ProcessCounts {
  /** Burning cells (flaming materials and coatings). */
  burning: number;
  /** Molten cells open to the air (lava, magma), bubbling. */
  boiling: number;
  /** Liquid cells that moved, per tick. */
  flowing: number;
  /** Cells covered by gas clouds, weighted toward fresh ones. */
  gassing: number;
  /** Hot cells quenched by liquid per tick (steam sizzle). */
  quenching: number;
}

export type ProcessKind = keyof ProcessCounts;

export const PROCESS_KINDS: readonly ProcessKind[] = [
  'burning',
  'boiling',
  'flowing',
  'gassing',
  'quenching',
];

export interface RenderSnapshot {
  tick: number;
  /** Turns taken this round; renderers clear last turn's trails when a newer shot appears. */
  turn: number;
  width: number;
  height: number;
  /** Material id per cell, row-major from the top-left. Read-only. */
  terrain: Uint8Array;
  /** Coating id per cell (0 = none). Read-only. */
  coating: Uint8Array;
  /** Gas id per cell (0 = none), only over air cells. Read-only. */
  gas: Uint8Array;
  /** The part of `gas` to refresh: where gas is now plus where it was last snapshot; null = none. */
  gasRect: Rect | null;
  /**
   * Cosmetic grain shade per cell (0 = never moved: shade by position). Moves with the cell, so
   * falling and flowing grains keep their colour. Not part of the state. Read-only.
   */
  shade?: Uint8Array;
  /** Rects of `terrain`/`coating` changed since the previous snapshot. */
  dirtyRects: Rect[];
  entities: EntityView[];
  effectEvents: EffectEvent[];
  /**
   * Sim debris particles (cells in flight that become terrain where they land). Positions are
   * fixed-point (divide by FP); only the first `count` entries are valid. Read-only.
   */
  debris: {
    count: number;
    x: Int32Array;
    y: Int32Array;
    vx: Int32Array;
    material: Uint8Array;
    /** Cosmetic grain shade per particle (see `shade`). */
    shade?: Uint8Array;
  };
  /** Wind in px/tick² (positive blows right). */
  wind: number;
  /** Air temperature, whole °C (§3.4). */
  temperature?: number | undefined;
  /** Width in columns of the sudden-death zone at each map edge (0 or unset = none). */
  deathZone?: number | undefined;
  /**
   * The aiming tank's shot path as aimed now (flat cell x, y pairs, one per tick), when it has a
   * Spotter Flare's aim preview; unset otherwise.
   */
  preview?: number[] | undefined;
  theme: string;
  /** Match weather (renderer: what falls and how wet the ground looks); unset = clear. */
  weather?: { id: string; kind: string; density: number; color: string; wet: number } | undefined;
  /**
   * Process counts the sim measured itself (optional, not hashed). The renderer measures what it
   * can see from the grid and takes the larger of the two per process, so a sim that tracks
   * fire spread or steam exactly only has to fill this in.
   */
  processes?: Partial<ProcessCounts> | undefined;
}
