import type { Vec2 } from '../render';
import { PLAYER_COLORS } from '../render/pixel/theme';

/**
 * Player markers (presentation only): when the camera is zoomed out far enough that tanks are a
 * few pixels tall, each live tank gets a readable chip above it (player number, bot name, life
 * bar), and a tank off the screen gets the same chip pinned to the screen edge with an arrow
 * pointing at it. Positions are recomputed every frame from the camera; nothing feeds the sim.
 */

/** On-screen chips show while a map cell is smaller than this many CSS px (tank ≈ 16 cells). */
export const SHOW_BELOW = 1.5;

/** Room kept clear at the screen edges for pinned chips: HUD bar on top, controls below. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Spot {
  /** Chip anchor in CSS px: bottom-centre on screen, centre when pinned to an edge. */
  x: number;
  y: number;
  /** The tank is off the screen; the chip is pinned to the edge. */
  off: boolean;
  /** Direction from the chip to the tank (radians, screen space, y down). */
  angle: number;
}

/**
 * Where to put the marker for a tank whose top is at `t` (CSS px) on a `w`×`h` playfield. A tank
 * inside the screen gets its chip right above it; one outside gets it where the line from the
 * screen centre to the tank crosses the inset rectangle.
 */
export function placeMarker(t: Vec2, w: number, h: number, inset: Insets): Spot {
  if (t.x >= 0 && t.x <= w && t.y >= 0 && t.y <= h) {
    return { x: t.x, y: t.y - 6, off: false, angle: Math.PI / 2 };
  }
  const x0 = inset.left;
  const x1 = Math.max(x0, w - inset.right);
  const y0 = inset.top;
  const y1 = Math.max(y0, h - inset.bottom);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const dx = t.x - cx;
  const dy = t.y - cy;
  // shrink the ray until it fits inside the inset box
  let k = 1;
  if (dx > 0 && cx + dx > x1) k = Math.min(k, (x1 - cx) / dx);
  if (dx < 0 && cx + dx < x0) k = Math.min(k, (x0 - cx) / dx);
  if (dy > 0 && cy + dy > y1) k = Math.min(k, (y1 - cy) / dy);
  if (dy < 0 && cy + dy < y0) k = Math.min(k, (y0 - cy) / dy);
  const x = cx + dx * k;
  const y = cy + dy * k;
  return { x, y, off: true, angle: Math.atan2(t.y - y, t.x - x) };
}

export interface MarkerTank {
  player: number;
  alive: boolean;
  /** Top centre of the tank in map cells. */
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  /** Bot name, or '' for a human. */
  name: string;
  active: boolean;
}

interface Node {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  fill: HTMLSpanElement;
  key: string;
}

const hex = (p: number) =>
  `#${(PLAYER_COLORS[p % PLAYER_COLORS.length] ?? 0xffffff).toString(16).padStart(6, '0')}`;

/** Keeps one DOM chip per player inside `host` and moves them each frame (no React renders). */
export class PlayerMarkers {
  private readonly nodes: Node[] = [];

  constructor(
    private readonly host: HTMLElement,
    private inset: Insets = { top: 48, right: 6, bottom: 6, left: 6 },
  ) {}

  /** Room the HUD takes at the playfield edges, so pinned chips never hide under it. */
  setInsets(inset: Insets): void {
    this.inset = inset;
  }

  update(
    tanks: readonly MarkerTank[],
    project: (p: Vec2) => Vec2,
    cellCss: number,
    w: number,
    h: number,
  ): void {
    const small = cellCss < SHOW_BELOW;
    for (const t of tanks) {
      const n = this.node(t.player);
      if (!t.alive) {
        n.root.hidden = true;
        continue;
      }
      const s = placeMarker(project({ x: t.x, y: t.y }), w, h, this.inset);
      if (!s.off && !small) {
        n.root.hidden = true;
        continue;
      }
      n.root.hidden = false;
      const hp = Math.max(0, Math.min(1, t.health / Math.max(1, t.maxHealth)));
      const key = `${s.off ? 1 : 0}${t.active ? 1 : 0}${t.name}${Math.round(hp * 100)}`;
      if (key !== n.key) {
        n.key = key;
        n.root.className = `pmark${s.off ? ' off' : ''}${t.active ? ' active' : ''}`;
        n.name.textContent = t.name;
        n.name.hidden = t.name === '';
        n.fill.style.width = `${hp * 100}%`;
        n.fill.className = `pm-fill${hp <= 0.25 ? ' low' : hp <= 0.5 ? ' mid' : ''}`;
      }
      n.root.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      n.root.style.setProperty('--a', `${s.angle.toFixed(3)}rad`);
    }
  }

  private node(player: number): Node {
    let n = this.nodes[player];
    if (n) return n;
    const doc = this.host.ownerDocument;
    const root = doc.createElement('div');
    root.className = 'pmark';
    root.dataset['player'] = String(player + 1);
    root.style.setProperty('--pc', hex(player));
    const chip = doc.createElement('div');
    chip.className = 'pm-chip';
    const num = doc.createElement('span');
    num.className = 'pm-num';
    num.textContent = String(player + 1);
    const name = doc.createElement('span');
    name.className = 'pm-name';
    const bar = doc.createElement('span');
    bar.className = 'pm-bar';
    const fill = doc.createElement('span');
    fill.className = 'pm-fill';
    bar.append(fill);
    chip.append(num, name, bar);
    const arrow = doc.createElement('div');
    arrow.className = 'pm-arrow';
    root.append(chip, arrow);
    this.host.append(root);
    n = { root, name, fill, key: '' };
    this.nodes[player] = n;
    return n;
  }
}

/**
 * Edge room for pinned chips on `playfield`: below the HUD's top bar and above the bottom controls
 * where they overlap it, plus a small margin all round.
 */
export function measureInsets(playfield: HTMLElement): Insets {
  const doc = playfield.ownerDocument;
  const box = playfield.getBoundingClientRect();
  const pad = 6;
  let top = pad;
  let bottom = pad;
  const bar = doc.querySelector('.hud-top');
  if (bar) {
    for (const el of bar.children) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top < box.top + box.height / 2)
        top = Math.max(top, r.bottom - box.top + 4);
    }
  }
  const controls = doc.querySelector('.controls');
  if (controls) {
    const r = controls.getBoundingClientRect();
    if (r.height > 0 && r.top < box.bottom) bottom = Math.max(bottom, box.bottom - r.top + 4);
    // upright phones float the gear chips (Heavy, Chute) just above the dock
    const gear = controls.querySelector('.weapons');
    if (gear) {
      const g = gear.getBoundingClientRect();
      if (g.height > 0 && g.top < r.top) bottom = Math.max(bottom, box.bottom - g.top + 4);
    }
  }
  return { top, right: pad, bottom, left: pad };
}
