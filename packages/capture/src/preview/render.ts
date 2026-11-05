import type { EffectEvent, RenderSnapshot } from '@mudders/shared';
import type { Frame } from './frame';

/**
 * Milestone-1 debug renderer: draws render snapshots into an RGB frame on the CPU so sim changes
 * can be reviewed as GIF/MP4 before the real Pixi renderer exists (milestone 2). It reads only
 * snapshots, exactly like a real renderer (§2b). Not the game's look: flat colours from material
 * manifests, simple shapes for tanks, rings and discs for effect events.
 */

/** Okabe–Ito colour-blind-safe player colours (§8). */
export const PLAYER_COLORS = [
  0xe69f00, 0x56b4e9, 0x009e73, 0xf0e442, 0x0072b2, 0xd55e00, 0xcc79a7, 0xffffff,
];

const SKY_TOP = 0x141a33;
const SKY_BOTTOM = 0x5a3f63;
const TANK_W = 16;
const TANK_H = 10;

interface LiveEffect {
  e: EffectEvent;
  until: number;
}

export class DebugRenderer {
  private readonly sky: Uint8Array;
  private trails = new Map<number, [number, number][]>();
  private live: LiveEffect[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    /** RGB per material cell byte. */
    readonly palette: Uint32Array,
  ) {
    this.sky = new Uint8Array(width * height * 3);
    const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
    for (let y = 0; y < height; y++) {
      const t = y / (height - 1);
      const r = lerp(SKY_TOP >> 16, SKY_BOTTOM >> 16, t);
      const g = lerp((SKY_TOP >> 8) & 255, (SKY_BOTTOM >> 8) & 255, t);
      const b = lerp(SKY_TOP & 255, SKY_BOTTOM & 255, t);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        this.sky[i] = r;
        this.sky[i + 1] = g;
        this.sky[i + 2] = b;
      }
    }
  }

  draw(s: RenderSnapshot, f: Frame, newTurn: boolean): void {
    if (newTurn) this.trails = new Map();
    f.data.set(this.sky);
    const d = f.data;
    const pal = this.palette;
    for (let i = 0; i < s.terrain.length; i++) {
      const m = s.terrain[i]!;
      if (m === 0) continue;
      const c = pal[m]!;
      // light per-cell dither so the pixel grid reads
      const shade = ((i * 2654435761) >>> 29) - 4;
      const o = i * 3;
      d[o] = Math.max(0, Math.min(255, (c >> 16) + shade));
      d[o + 1] = Math.max(0, Math.min(255, ((c >> 8) & 255) + shade));
      d[o + 2] = Math.max(0, Math.min(255, (c & 255) + shade));
    }

    const db = s.debris;
    for (let i = 0; i < db.count; i++) {
      f.blend(db.x[i]! / 65536, db.y[i]! / 65536, pal[db.material[i]!]!);
    }

    for (const e of s.effectEvents) {
      const dur =
        e.type === 'shockwave'
          ? Math.round((e.params.ticks ?? 10) * 1.6)
          : e.type === 'flash'
            ? 6
            : 14;
      this.live.push({ e, until: s.tick + dur });
    }
    this.live = this.live.filter((l) => l.until > s.tick);
    for (const { e, until } of this.live) {
      const start = e.tick;
      const t = (s.tick - start) / Math.max(1, until - start);
      if (e.type === 'shockwave') {
        f.ring(e.x, e.y, e.radius * Math.min(1, t * 1.6), 2.5, 0xe8f4ff, 0.75 * (1 - t));
      } else if (e.type === 'flash') {
        f.disc(e.x, e.y, e.radius * 1.15, 0xfff2c0, 0.6 * (1 - t));
      } else if (e.type === 'burst' || e.type === 'tankDeath') {
        const br =
          e.type === 'burst' ? Math.min(e.radius, 6 + (e.params.count ?? 20) / 2) : e.radius;
        f.disc(e.x, e.y, br * (0.6 + 0.5 * t), 0xff7a1a, 0.55 * (1 - t));
        f.disc(e.x, e.y, br * 0.45 * (1 - t), 0xffe066, 0.8 * (1 - t));
      } else if (e.type === 'ripple') {
        f.ring(e.x, e.y, e.radius * t, 1.5, 0xa0c8ff, 0.5 * (1 - t));
      }
    }

    for (const ent of s.entities) {
      if (ent.kind !== 'projectile') continue;
      const tr = this.trails.get(ent.id) ?? [];
      this.trails.set(ent.id, tr);
      tr.push([ent.x, ent.y]);
    }
    for (const tr of this.trails.values()) {
      for (let i = 1; i < tr.length; i++) {
        f.line(tr[i - 1]![0], tr[i - 1]![1], tr[i]![0], tr[i]![1], 0xffffff, 0.35);
      }
    }

    for (const ent of s.entities) {
      if (ent.kind === 'projectile') {
        f.disc(ent.x, ent.y, 1.6, 0xffffff);
        continue;
      }
      const col = PLAYER_COLORS[ent.player % PLAYER_COLORS.length]!;
      const x0 = ent.x - TANK_W / 2;
      const top = ent.y - TANK_H;
      if (!ent.alive) {
        f.rect(x0 + 2, ent.y - 3, TANK_W - 4, 3, 0x2a2a2a);
        continue;
      }
      f.rect(x0, ent.y - 5, TANK_W, 5, col);
      f.rect(x0 + 1, ent.y - 2, TANK_W - 2, 2, 0x222222, 0.5);
      f.rect(x0 + 4, top + 1, 8, 4, col);
      const rad = (ent.angle * Math.PI) / 180;
      f.line(ent.x, top + 2, ent.x + Math.cos(rad) * 9, top + 2 - Math.sin(rad) * 9, 0xeeeeee);
      const hp = Math.max(0, Math.min(1, ent.health / 100));
      f.rect(x0, top - 5, TANK_W, 2, 0x000000, 0.6);
      f.rect(
        x0,
        top - 5,
        Math.round(TANK_W * hp),
        2,
        hp > 0.5 ? 0x5ad35a : hp > 0.25 ? 0xf0c040 : 0xe04040,
      );
    }

    // wind gauge, top centre
    const cx = this.width / 2;
    const w = Math.max(-1, Math.min(1, s.wind / 0.012)) * 40;
    f.rect(cx - 41, 8, 82, 5, 0x000000, 0.5);
    f.rect(Math.min(cx, cx + w), 9, Math.abs(w), 3, 0x9fd8ff);
    f.rect(cx, 6, 1, 9, 0xffffff, 0.8);
  }
}
