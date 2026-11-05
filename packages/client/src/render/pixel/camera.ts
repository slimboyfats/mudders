import type { CameraControl, Vec2 } from '../types';

const MAX_SCALE = 16;

/**
 * Map ↔ screen transform for the pixel renderer. The terrain is drawn nearest-neighbour at an
 * integer device-pixel scale (§2a), except for the fit view on high-density screens or maps larger
 * than the viewport (see `fitScale`). Zoom steps are always integers. The origin is snapped to whole device pixels so cells
 * never shimmer while panning.
 */
export class Camera implements CameraControl {
  /** Viewport in device pixels. */
  vw = 1;
  vh = 1;
  dpr = 1;
  /** Map point at the viewport centre. */
  cx = 0;
  cy = 0;
  private s = 1;
  private fitted = true;

  constructor(
    readonly mapW: number,
    readonly mapH: number,
  ) {
    this.cx = mapW / 2;
    this.cy = mapH / 2;
  }

  get scale(): number {
    return this.s;
  }

  get isFit(): boolean {
    return this.fitted;
  }

  /**
   * Largest scale that shows the whole map. On standard-density screens it is an integer when
   * ≥ 1, so every cell is the same size. On high-density screens (DPR ≥ 2) a fractional fit is
   * used instead: a one-device-pixel difference between cells is invisible there, while rounding
   * down would waste up to half the screen on a phone.
   */
  fitScale(): number {
    const f = Math.min(this.vw / this.mapW, this.vh / this.mapH);
    return f >= 1 && this.dpr < 2 ? Math.floor(f) : f;
  }

  setViewport(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.vw = Math.max(1, Math.round(cssW * dpr));
    this.vh = Math.max(1, Math.round(cssH * dpr));
    if (this.fitted) this.fit();
    else this.clamp();
  }

  fit(): void {
    this.s = this.fitScale();
    this.cx = this.mapW / 2;
    this.cy = this.mapH / 2;
    this.fitted = true;
  }

  /** Device-pixel origin of map cell (0,0). */
  get ox(): number {
    return Math.round(this.vw / 2 - this.cx * this.s);
  }

  get oy(): number {
    return Math.round(this.vh / 2 - this.cy * this.s);
  }

  zoomBy(steps: number, screen?: Vec2): void {
    const fit = this.fitScale();
    let next: number;
    if (steps > 0) {
      next = this.s < 1 ? 1 : Math.floor(this.s) + steps;
    } else {
      next = Math.ceil(this.s) + steps;
      if (next < 1 || next < fit) next = fit;
    }
    this.zoomAround(Math.min(MAX_SCALE, next), screen);
  }

  zoomTo(scale: number, screen: Vec2): void {
    const fit = this.fitScale();
    let next = Math.max(fit, Math.min(MAX_SCALE, scale));
    if (next >= 1) next = Math.max(fit, Math.round(next));
    this.zoomAround(next, screen);
  }

  private zoomAround(next: number, screen?: Vec2): void {
    const sx = screen ? screen.x * this.dpr : this.vw / 2;
    const sy = screen ? screen.y * this.dpr : this.vh / 2;
    const mx = (sx - this.ox) / this.s;
    const my = (sy - this.oy) / this.s;
    this.s = next;
    // keep (mx, my) under (sx, sy)
    this.cx = mx - (sx - this.vw / 2) / next;
    this.cy = my - (sy - this.vh / 2) / next;
    this.fitted = next === this.fitScale() && this.coversWhole();
    if (this.fitted) this.fit();
    else this.clamp();
  }

  private coversWhole(): boolean {
    return this.mapW * this.s <= this.vw && this.mapH * this.s <= this.vh;
  }

  pan(dx: number, dy: number): void {
    this.cx -= (dx * this.dpr) / this.s;
    this.cy -= (dy * this.dpr) / this.s;
    this.fitted = false;
    this.clamp();
  }

  /** Keep the map on screen: centred on an axis it fits in, otherwise edge-to-edge at most. */
  private clamp(): void {
    const halfW = this.vw / 2 / this.s;
    const halfH = this.vh / 2 / this.s;
    this.cx =
      this.mapW <= 2 * halfW
        ? this.mapW / 2
        : Math.max(halfW, Math.min(this.mapW - halfW, this.cx));
    this.cy =
      this.mapH <= 2 * halfH
        ? this.mapH / 2
        : Math.max(halfH, Math.min(this.mapH - halfH, this.cy));
  }

  unproject(p: Vec2): Vec2 {
    return { x: (p.x * this.dpr - this.ox) / this.s, y: (p.y * this.dpr - this.oy) / this.s };
  }

  project(p: Vec2): Vec2 {
    return { x: (this.ox + p.x * this.s) / this.dpr, y: (this.oy + p.y * this.s) / this.dpr };
  }
}
