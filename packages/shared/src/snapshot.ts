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
  look: 'gas' | 'acid' | 'resonance' | 'toxic';
  /** Turns left. */
  turns: number;
  /** Gas clouds: each puff's centre in cells, flattened x, y (empty for a fixed zone). */
  puffs?: number[];
  /** Gas clouds: puff radius in cells. */
  puffRadius?: number;
  /** Gas clouds: ticks since the cloud burst out. */
  age?: number;
}

export type EntityView = TankView | ProjectileView | ZoneView;

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
  /** Rects of `terrain`/`coating` changed since the previous snapshot. */
  dirtyRects: Rect[];
  entities: EntityView[];
  effectEvents: EffectEvent[];
  /**
   * Sim debris particles (cells in flight that become terrain where they land). Positions are
   * fixed-point (divide by FP); only the first `count` entries are valid. Read-only.
   */
  debris: { count: number; x: Int32Array; y: Int32Array; vx: Int32Array; material: Uint8Array };
  /** Wind in px/tick² (positive blows right). */
  wind: number;
  theme: string;
}
