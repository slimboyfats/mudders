import type { EffectEvent, EntityView, RenderSnapshot } from '@mudders/shared';
import type { PixelTheme } from '../render/pixel/theme';
import type { MaterialLook, Quality, ShellLook, TankLook } from '../render/types';

/**
 * Messages between the capture CLI (Node, runs the sim) and the capture page (Chromium, runs the
 * real renderer) (§2d). Terrain travels as dirty-rect patches so a frame costs kilobytes.
 */
export interface WireInit {
  mapWidth: number;
  mapHeight: number;
  /** 0xRRGGBB per material cell id. */
  palette: number[];
  looks: MaterialLook[];
  themes: Record<string, PixelTheme>;
  tanks: Record<string, TankLook>;
  shells: Record<string, ShellLook>;
  liquids: number[];
  quality: Quality;
  theme: string;
  /** Canvas size in CSS px and device pixel ratio. */
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  /** Optional close-up: integer zoom steps from fit, centred on a map point. */
  zoom?: number;
  center?: { x: number; y: number };
  shake: boolean;
}

export interface WireSnapshot {
  tick: number;
  turn: number;
  /** [x, y, w, h, base64 of the w×h material bytes, same for coating bytes or '' if none]. */
  patches: [number, number, number, number, string, string][];
  entities: EntityView[];
  effectEvents: EffectEvent[];
  debris: { x: number[]; y: number[]; vx: number[]; m: number[] };
  wind: number;
  theme: string;
  weather?: RenderSnapshot['weather'];
  temperature?: number;
  deathZone?: number;
}

export interface CaptureApi {
  init(init: WireInit): string;
  /**
   * Apply snapshots in order; if `draw`, render at `time` (ticks) and return the frame as a PNG
   * data URL. Rendering never changes renderer state, so parallel pages that each draw every Nth
   * frame produce exactly the frames one page would.
   */
  /** `held`: hit-stop ticks so far (`HitStop.held`), passed through to `render`. */
  frame(snaps: WireSnapshot[], time: number, draw: boolean, held?: number): string;
}

declare global {
  interface Window {
    __mudders?: CaptureApi;
  }
}
