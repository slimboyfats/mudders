import type { WorldView } from '../game/match';
import type { Vec2 } from '../render';
import type { ShotGhost } from '../game/shot-ghost';
import { drawShotPath, type FrameOverlay } from './training-overlay';

/**
 * Last-shot ghost in matches: while a player this device controls is aiming, the path of their
 * previous shell is drawn faintly over the map, with a cross where it came down. A 2D canvas
 * over the map, redrawn only when the camera, the turn or the path changes (nothing through
 * React state).
 */
export class GhostOverlay implements FrameOverlay {
  private canvas: HTMLCanvasElement | null = null;
  private key = '';

  constructor(
    private readonly ghost: ShotGhost,
    private readonly mine: (player: number) => boolean,
  ) {}

  frame(host: HTMLElement, project: (p: Vec2) => Vec2, world: WorldView): void {
    // in a volley: this device's first tank still aiming
    const p = world.volley
      ? (world.tanks.find((t) => t.alive && !t.ready && t.bot < 0 && this.mine(t.player))?.player ??
        -1)
      : world.activePlayer;
    const shot = world.phase === 'aim' && this.mine(p) ? this.ghost.shots[p] : null;
    const path = shot && shot.path.length >= 4 ? shot.path : null;
    let c = this.canvas;
    if (!path) {
      if (c && this.key !== '') {
        c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        this.key = '';
      }
      return;
    }
    if (!c) {
      c = host.ownerDocument.createElement('canvas');
      c.className = 'training-overlay ghost-overlay';
      c.setAttribute('aria-hidden', 'true');
      host.append(c);
      this.canvas = c;
    }
    const w = host.clientWidth;
    const h = host.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const o = project({ x: 0, y: 0 });
    const u = project({ x: 100, y: 100 });
    const key = `${w}x${h}@${dpr}|${o.x.toFixed(1)},${o.y.toFixed(1)}|${u.x.toFixed(1)},${u.y.toFixed(1)}|${p}|${this.ghost.version}`;
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
    // a dark rim under pale dots: reads on bright sky and on dark ground alike
    g.save();
    g.translate(1, 1);
    drawShotPath(g, project, cell, path, 'rgb(0 0 0 / 0.35)');
    g.restore();
    drawShotPath(g, project, cell, path, 'rgb(236 244 255 / 0.55)');
  }

  dispose(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.key = '';
  }
}
