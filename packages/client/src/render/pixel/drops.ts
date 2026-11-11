import type { DropLook, DropView, EffectEvent, EntityView } from '@mudders/shared';
import type { QuadBatch } from './batch';
import { litColor } from './lighting';
import { PKind, type ParticleSink } from './particles';

/**
 * Supply drops (§3.8): the sim moves the crates (`@mudders/sim` drops: swing, land, tumble, get
 * thrown and smashed, so every client agrees where they are); this draws them cell by cell, a
 * wooden crate rotated by nearest-neighbour sampling so a tumbling crate stays made of map cells,
 * hanging from a banded canopy on two dotted lines. A canopy that lets go folds down onto the
 * ground and fades in steps; one a shell tore flutters down in rags. Pickups and breaks burst in
 * pixels. All cosmetic, keyed on the event so a replay draws the same.
 */

/** Crate cells: F frame, a/b planks, K the badge in the loot's colour, I its mark. */
const CRATE = [
  'FFFFFFFF',
  'FaaaaabF',
  'FbKKKKaF',
  'FaKIIKaF',
  'FaKIIKbF',
  'FbKKKKaF',
  'FbaaaaaF',
  'FFFFFFFF',
] as const;

const WOOD: Record<string, number> = {
  F: 0x4a2e16,
  a: 0xa8743c,
  b: 0x8a5c2c,
};

/** Badge and mark colours per loot. */
export const LOOK_COLOR: Record<DropLook, readonly [number, number]> = {
  weapon: [0xc0392a, 0x2a1410],
  gear: [0x3a72c0, 0xd8e8ff],
  health: [0x3aa048, 0xf0f8e8],
  fuel: [0xe0a820, 0x3a2a08],
  cash: [0xe8d040, 0x8a6a10],
};

/** Canopy rows (half-widths from the middle) and its two cloth colours in bands. */
const CANOPY = [4, 6, 7, 7, 7] as const;
const CLOTH = [0xf0ece0, 0xe86a2a] as const;
const CLOTH_SHADE = [0xc8c4b8, 0xb84c18] as const;
const LINE = 0x8a8478;

type Light = (x: number, y: number) => [number, number, number];

/** Draw a crate centred on (cx, cy) cells, turned `deg` clockwise, sampled cell by cell. */
export function drawCrate(
  b: QuadBatch,
  cx: number,
  cy: number,
  deg: number,
  look: DropLook,
  hurt: number,
  light: Light,
): void {
  const lit = light(cx, cy);
  const [badge, mark] = LOOK_COLOR[look];
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x0 = Math.floor(cx) - 6;
  const y0 = Math.floor(cy) - 6;
  for (let y = y0; y < y0 + 12; y++) {
    for (let x = x0; x < x0 + 12; x++) {
      // this map cell's middle, turned back into the crate's own frame
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = c * dx + s * dy + 4;
      const v = -s * dx + c * dy + 4;
      if (u < 0 || v < 0 || u >= 8 || v >= 8) continue;
      const i = Math.floor(u);
      const j = Math.floor(v);
      const code = CRATE[j]![i]!;
      let col = code === 'K' ? badge : code === 'I' ? mark : WOOD[code]!;
      // splits and scorch on a hurt crate: a few planks gone dark, in a fixed pattern
      if (hurt > 0 && code !== 'F' && ((i * 7 + j * 13) % 10) / 10 < hurt) col = 0x3a2412;
      b.rect(x, y, 1, 1, litColor(col, lit));
    }
  }
}

/** The canopy centred on column `ax` with its bottom row at `by`, breathing a little. */
function drawCanopy(
  b: QuadBatch,
  ax: number,
  by: number,
  id: number,
  t: number,
  light: Light,
): void {
  const lit = light(ax, by - 2);
  const breathe = Math.floor(t / 14 + id) % 3 === 0 ? 1 : 0;
  const x = Math.round(ax);
  const top = Math.round(by) - CANOPY.length + 1;
  for (let r = 0; r < CANOPY.length; r++) {
    const hw = CANOPY[r]! + (r === 1 ? breathe : 0) - (r === CANOPY.length - 1 ? breathe : 0);
    for (let k = -hw; k <= hw; k++) {
      // panels in two colours, the lowest row in shade and scalloped between panels
      const panel = Math.floor((k + 7) / 3) & 1;
      const last = r === CANOPY.length - 1;
      if (last && (k + 7) % 3 === 1) continue;
      const col = last ? CLOTH_SHADE[panel]! : CLOTH[panel]!;
      b.rect(x + k, top + r, 1, 1, litColor(col, lit));
    }
  }
}

/** A dotted line of whole cells from (x0, y0) to (x1, y1). */
function drawLine(b: QuadBatch, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 1; k < n; k += 2) {
    const x = Math.round(x0 + ((x1 - x0) * k) / n);
    const y = Math.round(y0 + ((y1 - y0) * k) / n);
    b.rect(x, y, 1, 1, LINE, 0.8);
  }
}

/** Every crate this snapshot, with the canopy and lines of those still hanging from one. */
export function drawDrops(
  b: QuadBatch,
  entities: readonly EntityView[],
  t: number,
  light: Light,
): void {
  for (const e of entities) {
    if (e.kind !== 'drop') continue;
    const d: DropView = e;
    if (d.chute !== undefined) {
      const by = d.y - 4 - 9;
      const a = (d.angle * Math.PI) / 180;
      // lines from the canopy's rim to the crate's top corners as it hangs, tilted with it
      const c = Math.cos(a);
      const s = Math.sin(a);
      const tlx = d.x + c * -3.5 - s * -4;
      const tly = d.y + s * -3.5 + c * -4;
      const trx = d.x + c * 3.5 - s * -4;
      const try_ = d.y + s * 3.5 + c * -4;
      drawLine(b, d.chute - 7, by, tlx, tly);
      drawLine(b, d.chute + 7, by, trx, try_);
      drawLine(b, d.chute - 2, by, tlx + 2, tly);
      drawLine(b, d.chute + 2, by, trx - 2, try_);
      drawCanopy(b, d.chute, by, d.id, t, light);
    }
    const hurt = d.maxHp > 0 ? Math.max(0, Math.min(0.7, 1 - d.hp / d.maxHp)) : 0;
    drawCrate(b, d.x, d.y, d.angle, d.look, hurt, light);
  }
}

/** A canopy left behind: folding down where the crate landed, or ripped and fluttering down. */
interface Cloth {
  x: number;
  y: number;
  start: number;
  torn: boolean;
  /** Drift per tick (cells), from the wind and the crate's swing. */
  dx: number;
}

const FOLD_TICKS = 36;
const LIE_TICKS = 150;
const RAG_TICKS = 110;

/** Small seeded generator for scatter: cosmetic, replayable from the event. */
function rngFor(e: EffectEvent): () => number {
  let s = (Math.imul(e.tick + 1, 0x9e3779b1) ^ Math.imul(e.x + 3, 0x85ebca6b) ^ (e.y * 977)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let v = s;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

export class DropFx {
  private cloths: Cloth[] = [];

  /** React to the sim's drop events. */
  handle(e: EffectEvent, sink: ParticleSink, wind: number): void {
    const p = e.params;
    switch (e.type) {
      case 'dropLand':
        if (p.chute === 1) {
          this.cloths.push({
            x: p.ax ?? e.x,
            y: e.y - 8 - 9 - 2,
            start: e.tick,
            torn: false,
            dx: Math.max(-0.12, Math.min(0.12, wind * 6 + ((p.ax ?? e.x) - e.x) * 0.02)),
          });
        }
        dust(e, sink, 4 + Math.min(14, (p.speed ?? 0) * 2));
        break;
      case 'dropTumble':
      case 'dropKnock':
        dust(e, sink, 4);
        break;
      case 'dropChuteTorn':
        this.cloths.push({ x: e.x, y: e.y, start: e.tick, torn: true, dx: wind * 6 });
        rags(e, sink);
        break;
      case 'dropBreak':
        planks(e, sink, 22);
        dust(e, sink, 10);
        break;
      case 'dropPickup':
        planks(e, sink, 10);
        sparkle(e, sink);
        break;
      case 'dropBurn':
        sink.add({
          x: e.x + 0.5,
          y: e.y - 4,
          vx: 0,
          vy: -0.2,
          life: 50,
          size: 3,
          color: 0x3a3430,
          kind: PKind.Dust,
        });
        break;
    }
  }

  /** Drop everything (a new round, a resync). */
  clear(): void {
    this.cloths = [];
  }

  draw(b: QuadBatch, t: number, solid: (x: number, y: number) => boolean): void {
    if (this.cloths.length === 0) return;
    this.cloths = this.cloths.filter(
      (c) => t - c.start < (c.torn ? RAG_TICKS : FOLD_TICKS + LIE_TICKS) && t >= c.start - 1,
    );
    for (const c of this.cloths) {
      const age = t - c.start;
      if (c.torn) {
        // two rags see-sawing down
        for (let k = 0; k < 2; k++) {
          const side = k === 0 ? -1 : 1;
          const fall = age * 0.55;
          const x = Math.round(
            c.x + side * (3 + age * 0.06) + c.dx * age + Math.sin(age * 0.2 + k) * 2,
          );
          const y = Math.round(c.y + fall);
          if (solid(x, y)) continue;
          const tilt = Math.sin(age * 0.2 + k) > 0 ? 1 : 0;
          const alpha = age > RAG_TICKS - 30 ? 0.5 : 1;
          for (let i = 0; i < 4; i++) {
            b.rect(x + i - 2, y + (i < 2 ? tilt : 1 - tilt), 1, 1, CLOTH[(i + k) & 1]!, alpha);
          }
        }
        continue;
      }
      // folding: the dome sinks onto the crate and flattens, drifting a little downwind
      const f = Math.min(1, age / FOLD_TICKS);
      const x0 = Math.round(c.x + c.dx * Math.min(age, FOLD_TICKS));
      let ground = Math.round(c.y + 5 + f * 13);
      for (let k = 0; k < 20 && !solid(x0, ground + 1); k++) ground++;
      const rows = f < 0.4 ? 4 : f < 0.8 ? 3 : 2;
      // lying cloth fades out in steps, never smoothly
      const lie = age - FOLD_TICKS;
      const alpha = lie < LIE_TICKS * 0.5 ? 1 : lie < LIE_TICKS * 0.8 ? 0.66 : 0.33;
      for (let r = 0; r < rows; r++) {
        const hw = Math.round((5 + f * 3) * (r === 0 ? 0.6 : 1) + r);
        const y = ground - rows + 1 + r;
        for (let k = -hw; k <= hw; k++) {
          if (solid(x0 + k, y)) continue;
          const panel = Math.floor((k + 9) / 3) & 1;
          const col = r === rows - 1 ? CLOTH_SHADE[panel]! : CLOTH[panel]!;
          b.rect(x0 + k, y, 1, 1, col, alpha);
        }
      }
    }
  }
}

function dust(e: EffectEvent, sink: ParticleSink, n: number): void {
  const r = rngFor(e);
  for (let k = 0; k < n; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    sink.add({
      x: e.x + side * (3 + r() * 3),
      y: e.y - r() * 2,
      vx: side * (0.2 + r() * 0.5),
      vy: -r() * 0.35,
      life: 30 + r() * 30,
      size: 2 + Math.floor(r() * 3),
      color: r() < 0.5 ? 0xa89070 : 0x8a7458,
      kind: PKind.Dust,
    });
  }
}

/** Splinters and plank ends flying off a crate (the sim throws real wood grains too). */
function planks(e: EffectEvent, sink: ParticleSink, n: number): void {
  const r = rngFor(e);
  const vx = (e.params.vx ?? 0) / 100;
  const vy = (e.params.vy ?? 0) / 100;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI * r();
    const sp = 0.6 + r() * 1.8;
    sink.add({
      x: e.x + Math.round((r() - 0.5) * 7),
      y: e.y + Math.round((r() - 0.5) * 7),
      vx: Math.cos(a) * sp + vx * 0.3,
      vy: Math.sin(a) * sp + vy * 0.3,
      life: 30 + r() * 40,
      size: 1,
      color: k % 3 === 0 ? WOOD.F! : k % 3 === 1 ? WOOD.a! : WOOD.b!,
      kind: PKind.Chunk,
    });
  }
}

const LOOK_ORDER: readonly DropLook[] = ['weapon', 'gear', 'health', 'fuel', 'cash'];

/** The loot's colour rising off the tank that took it, in single cells. */
function sparkle(e: EffectEvent, sink: ParticleSink): void {
  const r = rngFor(e);
  const look = LOOK_ORDER[(e.params.look ?? 0) | 0] ?? 'weapon';
  const [badge] = LOOK_COLOR[look];
  const tx = e.params.tx ?? e.x;
  const ty = e.params.ty ?? e.y;
  for (let k = 0; k < 18; k++) {
    sink.add({
      x: Math.round(tx + (r() - 0.5) * 14),
      y: Math.round(ty + (r() - 0.5) * 6),
      vx: (r() - 0.5) * 0.2,
      vy: -0.3 - r() * 0.6,
      life: 20 + r() * 25,
      size: 1,
      color: k % 3 === 0 ? 0xffffff : badge,
      kind: PKind.Spark,
    });
  }
}

/** Cloth rags torn off a canopy. */
function rags(e: EffectEvent, sink: ParticleSink): void {
  const r = rngFor(e);
  for (let k = 0; k < 10; k++) {
    sink.add({
      x: e.x + (r() - 0.5) * 12,
      y: e.y + (r() - 0.5) * 3,
      vx: (r() - 0.5) * 1.2,
      vy: -r() * 0.8,
      life: 120 + r() * 120,
      size: 1,
      color: CLOTH[k & 1]!,
      kind: PKind.Leaf,
    });
  }
}
