import { QUALITIES, type Quality } from '../render/types';

/** A window of frames averaging slower than this (ms) is too slow: below about 40 fps. */
const SLOW_MS = 25;
/** A window averaging faster than this (ms) is smooth enough to try a step back up. */
const FAST_MS = 17.5;
/** Frames are judged in windows this long (ms of wall time). */
const WINDOW_MS = 2000;
/** Slow windows in a row before stepping down, and smooth ones before stepping back up. */
const DOWN_AFTER = 2;
const UP_AFTER = 15;
/** After any change the next windows are ignored: new buffers and shaders warm up. */
const SETTLE_WINDOWS = 1;
/** A single frame longer than this is a hiccup (tab switch, GC, a shader compile), not the pace. */
const HICCUP_MS = 250;

/** On low quality the canvas is drawn at no more than this many device pixels per CSS pixel. */
const LOW_DPR = 2;

/**
 * Pixel density to draw at: the screen's own, except that low quality caps it. A phone screen has
 * three device pixels (or more) per CSS pixel; drawing two and letting the browser scale the
 * canvas up (nearest-neighbour) more than halves the pixels every pass has to fill.
 */
export function renderDpr(quality: Quality, deviceDpr: number): number {
  const dpr = deviceDpr > 0 ? deviceDpr : 1;
  return quality === 'low' ? Math.min(dpr, LOW_DPR) : dpr;
}

/**
 * Picks the render quality from how long frames really take (§9: hold the frame rate on phones).
 * It starts at the player's chosen quality, which is also the highest it ever uses; when frames
 * run long for a few seconds it steps down a level, and after a long smooth stretch it tries one
 * step back up. A level it had to leave twice is not tried again, so it never keeps flipping.
 * Wall-clock only and per device: nothing here touches the sim.
 */
export class AutoQuality {
  private level: number;
  private readonly top: number;
  /** How often it was forced off each level; a level it left twice is not tried again. */
  private readonly left: number[] = QUALITIES.map(() => 0);
  private sum = 0;
  private frames = 0;
  private slow = 0;
  private fast = 0;
  private skip = SETTLE_WINDOWS;

  constructor(chosen: Quality) {
    this.top = Math.max(0, QUALITIES.indexOf(chosen));
    this.level = this.top;
  }

  get quality(): Quality {
    return QUALITIES[this.level] ?? 'low';
  }

  /**
   * Feed one frame's wall time (ms since the previous frame). Returns the new quality when it
   * changes, otherwise null.
   */
  frame(wallMs: number): Quality | null {
    if (!(wallMs > 0) || wallMs > HICCUP_MS) return null;
    this.sum += wallMs;
    this.frames++;
    if (this.sum < WINDOW_MS) return null;
    const avg = this.sum / this.frames;
    this.sum = 0;
    this.frames = 0;
    if (this.skip > 0) {
      this.skip--;
      return null;
    }
    if (avg > SLOW_MS) {
      this.fast = 0;
      if (++this.slow >= DOWN_AFTER && this.level > 0) {
        this.left[this.level] = (this.left[this.level] ?? 0) + 1;
        return this.set(this.level - 1);
      }
    } else {
      this.slow = 0;
      if (avg < FAST_MS) {
        if (
          ++this.fast >= UP_AFTER &&
          this.level < this.top &&
          (this.left[this.level + 1] ?? 0) < 2
        ) {
          return this.set(this.level + 1);
        }
      } else this.fast = 0;
    }
    return null;
  }

  private set(level: number): Quality {
    this.level = level;
    this.slow = 0;
    this.fast = 0;
    this.skip = SETTLE_WINDOWS;
    return this.quality;
  }
}
