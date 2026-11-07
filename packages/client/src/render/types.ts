import type { RenderSnapshot } from '@mudders/shared';
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
  shell: 'spark' | 'fire' | 'ricochet' | 'meteor' | 'mud' | 'glue' | 'firework' | 'star';
  trail: boolean;
  /** Scale of a meteor head and streak. */
  size?: number;
  /** 0xRRGGBB of the trail and the shell's glow, by weapon type; unset = the theme's trail. */
  trailColor?: number;
}

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
}

export interface RendererOptions {
  quality: Quality;
  theme: string;
  palette: RenderPalette;
  /** Brief automatic zoom-punch/shake on big hits (§2a); can be disabled. */
  shake?: boolean;
  /** Keep the drawing buffer so it can be read back (headless capture). */
  preserveDrawingBuffer?: boolean;
}

export interface Renderer {
  mount(canvas: HTMLCanvasElement, snapshots: SnapshotStream, options: RendererOptions): void;
  /** Canvas size in CSS pixels and the device pixel ratio. Keeps the camera's centre. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  setTheme(id: string): void;
  setQuality(quality: Quality): void;
  /**
   * Draw one frame. `time` is in sim ticks (fractional between ticks); cosmetic animation is a
   * function of it, never of the wall clock, so a capture replays byte-identically.
   */
  render(time: number): void;
  readonly camera: CameraControl;
  /** Screen (CSS px, canvas-relative) → map coordinates. */
  unproject(screen: Vec2): Vec2;
  /** Map coordinates → screen (CSS px, canvas-relative). */
  project(map: Vec2): Vec2;
  unmount(): void;
}

/** Per-client camera (§2a): fits the map by default; zoom and pan are purely visual. */
export interface CameraControl {
  fit(): void;
  /** Zoom by integer steps (+1 in, -1 out), keeping the map point under `screen` (CSS px) fixed. */
  zoomBy(steps: number, screen?: Vec2): void;
  /** Continuous zoom (pinch), snapped to an integer cell scale when ≥ 1. */
  zoomTo(scale: number, screen: Vec2): void;
  /** Pan by a screen delta in CSS px. */
  pan(dx: number, dy: number): void;
  /** Device pixels per map cell. */
  readonly scale: number;
  readonly isFit: boolean;
}

export type RendererKind = 'pixel';
