import type { EffectEvent, ProcessCounts, RenderSnapshot } from '@mudders/shared';
import type { PixelTheme } from './pixel/theme';

/**
 * The renderer boundary (REQUIREMENTS §2b, ARCHITECTURE §5). A renderer reads render snapshots and
 * nothing else: it never calls into the sim and never holds game state. The pixel renderer is the
 * only implementation in v1; the interface leaves room for others (e.g. a voxel view).
 */

export type Quality = 'low' | 'medium' | 'high';
export const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

export interface Vec2 {
  x: number;
  y: number;
}

/** Push stream of render snapshots, one per sim tick, in tick order. */
export interface SnapshotStream {
  subscribe(listener: (snapshot: RenderSnapshot) => void): () => void;
}

/** Renderer-side display data derived from content (material colours). Not game state. */
export interface RenderPalette {
  /** 0xRRGGBB per material cell id (index 0 = air, ignored). */
  materials: Uint32Array;
  /** Animated looks (palette cycling, heat haze) per material cell. */
  looks?: readonly MaterialLook[];
  /** Theme looks by `theme.*` id; unknown ids fall back to the default. */
  themes?: Readonly<Record<string, PixelTheme>>;
  /** Tank sprites by `tank.*` id (from the manifest `look`); unknown ids use the standard tank. */
  tanks?: Readonly<Record<string, TankLook>>;
  /** Shell looks by `weapon.*` id; weapons not listed draw the default spark with a trail. */
  shells?: Readonly<Record<string, ShellLook>>;
  /** Material cells of cold liquids that splash and ripple (water, liquid dirt, oil). */
  liquids?: readonly number[];
  /** Material cells of hot liquids (lava): a glowing, bubbling surface. */
  hotLiquids?: readonly number[];
  /** Material cells of slurries (mud, wet clay): a sluggish, plopping surface. */
  heavyLiquids?: readonly number[];
  /** How hard each weapon kicks when fired (0.1-1), by weapon index (`muzzle` event `weapon`). */
  muzzles?: readonly number[];
}

/** A tank type's pixel look (manifest `look`); plain data so it can cross the wire. */
export interface TankLook {
  /** Rows top to bottom, bottom-aligned and centred on the tank's column (codes in the manifest). */
  sprite: readonly string[];
  /** Barrel pivot in cells from the bottom-centre (y up), length and thickness in cells. */
  barrel: { x: number; y: number; length: number; width: number };
}

/** How a weapon's shell is drawn in flight (from its manifest `look`). */
export interface ShellLook {
  shell:
    | 'spark'
    | 'fire'
    | 'ricochet'
    | 'meteor'
    | 'mud'
    | 'glue'
    | 'firework'
    | 'star'
    | 'rocket'
    | 'stage'
    | 'plasma'
    | 'rail'
    | 'acid'
    | 'psi'
    | 'vapor'
    | 'shard'
    | 'hornet'
    | 'saw'
    | 'bird';
  trail: boolean;
  /** Scale of a meteor head and streak. */
  size?: number;
  /** 0xRRGGBB of the trail and the shell's glow, by weapon type; unset = the theme's trail. */
  trailColor?: number;
  /** In-flight look of a plain (`spark`) shell, by weapon family; unset = the plain spark. */
  flight?: FlightStyle;
}

/** Weapon-family looks for plain shells in flight (see `render/pixel/flight.ts`). */
export type FlightStyle =
  | 'missile'
  | 'bomb'
  | 'homing'
  | 'bomblet'
  | 'flask'
  | 'charge'
  | 'drill'
  | 'clod'
  | 'roller'
  | 'warp'
  | 'prism'
  | 'beacon'
  | 'medic';

/** A material's renderer look (from its manifest `look`); plain data so it can cross the wire. */
export interface MaterialLook {
  cell: number;
  /** 0xRRGGBB colours stepped through in hard bands; empty = no cycling. */
  cycle: number[];
  /** Ticks per cycle step. */
  ticks: number;
  /** The air above shimmers (heat haze). */
  hot: boolean;
  /** Grows the theme's grass on exposed tops. */
  topsoil?: boolean;
  /** Chars black and smoulders with embers after a blast, like topsoil, but grows no grass. */
  char?: boolean;
  /** Pixel flames and smoke rise off exposed tops. */
  flames?: boolean;
  /** Crystalline: scattered cells glint white for a moment (frost). */
  glint?: boolean;
  /** Sways in the wind, 0–1 (trees); 0 or unset = stays put. */
  sway?: number;
  /** Sways only where its column also holds a swaying canopy (a trunk, not a house wall). */
  limb?: boolean;
  /** Gas only: share of its cells drawn, as an ordered dither. */
  cover?: number;
  /**
   * 0xRRGGBB light the cell gives off onto the ground and air near it (plasma violet, reactor
   * green). Hot and flaming cells without one glow the warm heat colour.
   */
  emit?: number;
}

export interface RendererOptions {
  quality: Quality;
  theme: string;
  palette: RenderPalette;
  /** Screen shake on hits, scaled to blast size (§2a); off for reduced motion. */
  shake?: boolean;
  /** The sky turns from day to sunset, night and dawn as the rounds go by (default on). */
  dayNight?: boolean;
  /** Bots say things in speech bubbles over their tanks (default on). */
  chatter?: boolean;
  /** Keep the drawing buffer so it can be read back (headless capture). */
  preserveDrawingBuffer?: boolean;
  /**
   * Sound cues the renderer spots itself (e.g. `waterSplash` when a shell hits a pool), as effect
   * events for the audio engine. Called at most once per snapshot.
   */
  onCues?: (events: readonly EffectEvent[]) => void;
  /**
   * How much is burning, boiling, flowing and gassing in the world, measured from each snapshot
   * (for the process soundscape). Called once per snapshot; the object is reused.
   */
  onProcesses?: (counts: Readonly<ProcessCounts>) => void;
  /**
   * Most sim ticks of GPU smoke-fluid and particle updates one frame runs (live play). A frame
   * that comes late queues several ticks; running a GPU pass for each makes that frame slower
   * still, the next one queues more, and a slow phone spirals into a slideshow. Past this many
   * the extra ticks are skipped (cosmetic only). Unset: every tick runs (captures replay exactly).
   */
  catchUp?: number;
}

export interface Renderer {
  mount(canvas: HTMLCanvasElement, snapshots: SnapshotStream, options: RendererOptions): void;
  /** Canvas size in CSS pixels and the device pixel ratio. Keeps the camera's centre. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  setTheme(id: string): void;
  setQuality(quality: Quality): void;
  /**
   * Draw one frame. `time` is in sim ticks (fractional between ticks); cosmetic animation is a
   * function of it, never of the wall clock, so a capture replays byte-identically. `held` is the
   * ticks hit-stop has held the picture so far (`HitStop.held`): shakes run on `time + held`, so
   * they keep moving while the sim waits.
   */
  render(time: number, held?: number): void;
  readonly camera: CameraControl;
  /** Screen (CSS px, canvas-relative) → map coordinates. */
  unproject(screen: Vec2): Vec2;
  /** Map coordinates → screen (CSS px, canvas-relative). */
  project(map: Vec2): Vec2;
  unmount(): void;
  /** Figures for the performance recorder, where the renderer has them. */
  readonly perf?: RenderPerf;
}

/** Names of the parts of a frame the GPU time is split into, in `RenderPerf.takeGpu` order. */
export const GPU_PARTS = ['step', 'prep', 'bg', 'sprites', 'particles', 'rest'] as const;

/** What a renderer can tell the performance recorder (Settings → Show performance → Record). */
export interface RenderPerf {
  /** Turn timing on or off. False when the browser can't time the GPU (the rest still works). */
  enable(on: boolean): boolean;
  /** CPU ms spent on snapshots (the renderer's per-tick work) so far, while timing is on. */
  pushMs(): number;
  /** GPU ms per frame for each of `GPU_PARTS` since the last call, or null where not timed. */
  takeGpu(): number[] | null;
  /** True when those times are rough samples (`gl.finish` around one part now and then). */
  gpuSampled(): boolean;
  /** Particle slots the GPU works on right now. */
  particles(): number;
  /** The graphics chip, as the browser names it. */
  device(): string;
}

/** Per-client camera (§2a): fits the map by default; zoom and pan are purely visual. */
export interface CameraControl {
  fit(): void;
  /** Zoom by integer steps (+1 in, -1 out), keeping the map point under `screen` (CSS px) fixed. */
  zoomBy(steps: number, screen?: Vec2): void;
  /**
   * Continuous zoom, snapped to an integer cell scale when ≥ 1 unless `snap` is false (a pinch
   * in progress follows the fingers exactly; `settle` tidies up afterwards).
   */
  zoomTo(scale: number, screen: Vec2, snap?: boolean): void;
  /** `zoomBy`, eased over a few frames (wheel, zoom buttons). */
  glideBy(steps: number, screen?: Vec2): void;
  /** After a pinch: ease to a crisp integer scale where that matters (DPR < 2). */
  settle(screen?: Vec2): void;
  /** Pan momentum after a one-finger drag lifts, CSS px per ms. */
  fling(vx: number, vy: number): void;
  /** Stop any glide or momentum. */
  hold(): void;
  /** Advance glides and momentum by `dt` ms of wall time (called once per frame). */
  update(dt: number): void;
  /** Pan by a screen delta in CSS px. */
  pan(dx: number, dy: number): void;
  /** Device pixels per map cell. */
  readonly scale: number;
  readonly isFit: boolean;
}

export type RendererKind = 'pixel';
