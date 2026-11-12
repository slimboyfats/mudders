import type { CameraControl, Vec2 } from '../types';

const MAX_SCALE = 16;
/** Zoom glide time constant (ms): ~95% of the way in three of these. */
const GLIDE_MS = 45;
/** Fling momentum decay time constant (ms). */
const FLING_MS = 220;
/** Fastest fling, CSS px per ms. */
const MAX_FLING = 4;

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
  /** Zoom glide in progress: target scale and the CSS-px point that stays put. */
  private glide: { to: number; at: Vec2 | undefined } | null = null;
  /** Pan momentum after a fling, CSS px per ms. */
  private vx = 0;
  private vy = 0;

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
    // a change of pixel density (the quality stepping down) keeps what is on screen: the zoom is
    // in device pixels per cell, so it scales with the density
    if (!this.fitted && this.dpr > 0 && dpr !== this.dpr) this.s *= dpr / this.dpr;
    this.dpr = dpr;
    this.vw = Math.max(1, Math.round(cssW * dpr));
    this.vh = Math.max(1, Math.round(cssH * dpr));
    if (this.fitted) this.fit();
    else this.clamp();
  }

  fit(): void {
    this.hold();
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

  zoomTo(scale: number, screen: Vec2, snap = true): void {
    const fit = this.fitScale();
    let next = Math.max(fit, Math.min(MAX_SCALE, scale));
    if (snap && next >= 1) next = Math.max(fit, Math.round(next));
    this.zoomAround(next, screen);
  }

  /** Like `zoomBy`, but eases there over a few frames (wheel, zoom buttons). */
  glideBy(steps: number, screen?: Vec2): void {
    const from = this.glide?.to ?? this.s;
    const fit = this.fitScale();
    let next: number;
    if (steps > 0) next = from < 1 ? 1 : Math.floor(from) + steps;
    else {
      next = Math.ceil(from) + steps;
      if (next < 1 || next < fit) next = fit;
    }
    this.vx = this.vy = 0;
    this.glide = { to: Math.min(MAX_SCALE, next), at: screen };
  }

  /**
   * End of a pinch: on standard-density screens ease to the nearest whole cell scale so the
   * pixels stay crisp (§2a); on high-density screens a fractional scale is invisible, so the view
   * stays exactly where the fingers left it.
   */
  settle(screen?: Vec2): void {
    if (this.dpr >= 2 || this.s < 1 || this.fitted) return;
    const to = Math.max(this.fitScale(), Math.round(this.s));
    if (to !== this.s) this.glide = { to, at: screen };
  }

  /** Keep the pan going after the finger lifts, CSS px per ms. */
  fling(vx: number, vy: number): void {
    const v = Math.hypot(vx, vy);
    const k = v > MAX_FLING ? MAX_FLING / v : 1;
    this.vx = vx * k;
    this.vy = vy * k;
  }

  /** Stop any glide or momentum (a finger touched down). */
  hold(): void {
    this.vx = this.vy = 0;
    this.glide = null;
  }

  /** Advance glides and momentum by `dt` ms of wall time. Presentation only. */
  update(dt: number): void {
    if (dt <= 0) return;
    if (this.glide) {
      const { to, at } = this.glide;
      const k = 1 - Math.exp(-dt / GLIDE_MS);
      const next = Math.abs(to - this.s) < 0.01 * to ? to : this.s + (to - this.s) * k;
      if (next === to) this.glide = null;
      this.zoomAround(next, at);
    }
    if (this.vx !== 0 || this.vy !== 0) {
      this.pan(this.vx * dt, this.vy * dt);
      const decay = Math.exp(-dt / FLING_MS);
      this.vx *= decay;
      this.vy *= decay;
      if (Math.hypot(this.vx, this.vy) < 0.02) this.vx = this.vy = 0;
    }
  }

  /** True while a glide or momentum is moving the view. */
  get moving(): boolean {
    return this.glide !== null || this.vx !== 0 || this.vy !== 0;
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
    // pinching all the way out lands back on the centred whole-map view
    this.fitted = next === this.fitScale();
    if (this.fitted) this.fit();
    else this.clamp();
  }

  pan(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.cx -= (dx * this.dpr) / this.s;
    this.cy -= (dy * this.dpr) / this.s;
    this.fitted = false;
    this.clamp();
  }

  /**
   * Free camera: the view centre may go anywhere on the map, so any point (a tank at the very
   * edge, say) can be brought to the middle of the screen, with letterbox beyond the map edge.
   */
  private clamp(): void {
    this.cx = Math.max(0, Math.min(this.mapW, this.cx));
    this.cy = Math.max(0, Math.min(this.mapH, this.cy));
  }

  unproject(p: Vec2): Vec2 {
    return { x: (p.x * this.dpr - this.ox) / this.s, y: (p.y * this.dpr - this.oy) / this.s };
  }

  project(p: Vec2): Vec2 {
    return { x: (this.ox + p.x * this.s) / this.dpr, y: (this.oy + p.y * this.s) / this.dpr };
  }
}
