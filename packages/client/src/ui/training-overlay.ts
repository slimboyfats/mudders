import type { World } from '@mudders/sim';
import type { Vec2 } from '../render';

/**
 * Something drawn over the map each frame, in screen space, by the page around a match
 * (MatchView calls `frame` from its frame loop; nothing goes through React state).
 */
export interface FrameOverlay {
  frame(host: HTMLElement, project: (p: Vec2) => Vec2, world: World): void;
  dispose(): void;
}

/** Lines every this many tanks are drawn brighter and numbered. */
const MAJOR = 5;
/** Dots along a shot path: one every this many recorded ticks. */
const DOT_EVERY = 2;
/** Newest path first: the colour of each kept path. */
const PATH_STYLE = ['rgb(255 216 74 / 0.95)', 'rgb(255 216 74 / 0.5)', 'rgb(255 216 74 / 0.28)'];

/**
 * Training overlay: a grid one tank apart counted out from your tank (toggle), and the flight
 * paths of your last shots, so the next shot can be judged against them. Drawn on a 2D canvas
 * over the map, and only redrawn when the camera, the paths or the grid switch change.
 */
export class TrainingOverlay implements FrameOverlay {
  grid = false;
  paths: readonly number[][] = [];
  pathVersion = 0;
  private canvas: HTMLCanvasElement | null = null;
  private key = '';

  setGrid(on: boolean): void {
    this.grid = on;
  }

  frame(host: HTMLElement, project: (p: Vec2) => Vec2, world: World): void {
    const me = world.tanks[0];
    if (!me) return;
    let c = this.canvas;
    if (!c) {
      c = host.ownerDocument.createElement('canvas');
      c.className = 'training-overlay';
      c.setAttribute('aria-hidden', 'true');
      host.append(c);
      this.canvas = c;
    }
    const w = host.clientWidth;
    const h = host.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const o = project({ x: 0, y: 0 });
    const u = project({ x: 100, y: 100 });
    const key = `${w}x${h}@${dpr}|${o.x.toFixed(1)},${o.y.toFixed(1)}|${u.x.toFixed(1)},${u.y.toFixed(1)}|${
      this.grid ? `${me.x},${me.y},${me.w}` : 'off'
    }|${this.pathVersion}|${this.paths.length}`;
    if (key === this.key) return;
    this.key = key;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const cell = (u.x - o.x) / 100;
    if (this.grid) this.drawGrid(g, project, world, cell, w, h);
    this.drawPaths(g, project, cell);
  }

  private drawGrid(
    g: CanvasRenderingContext2D,
    project: (p: Vec2) => Vec2,
    world: World,
    cell: number,
    w: number,
    h: number,
  ): void {
    const me = world.tanks[0];
    if (!me) return;
    const tank = Math.max(1, me.w);
    const W = world.grid.width;
    const H = world.grid.height;
    const step = tank * cell;
    // too dense to read when zoomed far out: only the numbered lines
    const every = step < 6 ? MAJOR : 1;
    const top = Math.max(0, project({ x: 0, y: 0 }).y);
    const bottom = Math.min(h, project({ x: 0, y: H }).y);
    const left = Math.max(0, project({ x: 0, y: 0 }).x);
    const right = Math.min(w, project({ x: W, y: 0 }).x);
    const ground = project({ x: me.x, y: me.y });
    g.lineWidth = 1;
    g.font = '600 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    const kMin = Math.ceil(-me.x / tank);
    const kMax = Math.floor((W - me.x) / tank);
    for (let k = kMin; k <= kMax; k++) {
      if (k % every !== 0) continue;
      const sx = Math.round(project({ x: me.x + k * tank, y: 0 }).x) + 0.5;
      if (sx < 0 || sx > w) continue;
      const major = k % MAJOR === 0;
      g.strokeStyle = major ? 'rgb(160 210 255 / 0.42)' : 'rgb(160 210 255 / 0.16)';
      g.beginPath();
      g.moveTo(sx, top);
      g.lineTo(sx, bottom);
      g.stroke();
      if (major && k !== 0) this.label(g, String(Math.abs(k)), sx, ground.y - 22);
    }
    const jMin = Math.ceil((me.y - H) / tank);
    const jMax = Math.floor(me.y / tank);
    for (let j = jMin; j <= jMax; j++) {
      if (j % every !== 0) continue;
      const sy = Math.round(project({ x: 0, y: me.y - j * tank }).y) + 0.5;
      if (sy < 0 || sy > h) continue;
      g.strokeStyle = j % MAJOR === 0 ? 'rgb(160 210 255 / 0.32)' : 'rgb(160 210 255 / 0.12)';
      g.beginPath();
      g.moveTo(left, sy);
      g.lineTo(right, sy);
      g.stroke();
    }
  }

  private label(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    const tw = g.measureText(text).width + 8;
    g.fillStyle = 'rgb(6 10 30 / 0.8)';
    g.fillRect(Math.round(x - tw / 2), Math.round(y - 15), Math.round(tw), 15);
    g.fillStyle = '#d8ecff';
    g.fillText(text, x, y - 1);
  }

  private drawPaths(g: CanvasRenderingContext2D, project: (p: Vec2) => Vec2, cell: number): void {
    // a hard square per dot, a little bigger than a map cell: pixel look, no smooth line
    const size = Math.max(2, Math.round(Math.min(4, cell * 1.5)));
    const n = this.paths.length;
    for (let i = 0; i < n; i++) {
      const path = this.paths[i];
      if (!path || path.length < 2) continue;
      g.fillStyle = PATH_STYLE[n - 1 - i] ?? PATH_STYLE[PATH_STYLE.length - 1] ?? '#ffd84a';
      for (let k = 0; k + 1 < path.length; k += 2 * DOT_EVERY) {
        const s = project({ x: (path[k] ?? 0) + 0.5, y: (path[k + 1] ?? 0) + 0.5 });
        g.fillRect(Math.round(s.x - size / 2), Math.round(s.y - size / 2), size, size);
      }
      // where it came down: a small cross
      const s = project({
        x: (path[path.length - 2] ?? 0) + 0.5,
        y: (path[path.length - 1] ?? 0) + 0.5,
      });
      const a = size + 2;
      const x = Math.round(s.x);
      const y = Math.round(s.y);
      for (let d = -a; d <= a; d++) {
        g.fillRect(x + d - 1, y + d - 1, 2, 2);
        g.fillRect(x + d - 1, y - d - 1, 2, 2);
      }
    }
  }

  dispose(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.key = '';
  }
}
