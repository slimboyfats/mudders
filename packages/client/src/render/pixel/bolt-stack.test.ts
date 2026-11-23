import { describe, expect, it } from 'vitest';
import type { QuadBatch } from './batch';
import { boltStack } from './effects';

interface Quad {
  x: number;
  y: number;
  w: number;
  h: number;
  rgb: number;
  a: number;
}

function batch(): { quads: Quad[]; batch: QuadBatch } {
  const quads: Quad[] = [];
  const b = {
    push(x: number, y: number, w: number, h: number, rgb: number, a = 1) {
      quads.push({ x, y, w, h, rgb, a });
    },
  };
  return { quads, batch: b as unknown as QuadBatch };
}

/** Additive light per half cell (edges fall on half cells) and colour channel. */
function light(quads: readonly Quad[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const q of quads) {
    const x0 = Math.round((q.x - q.w / 2) * 2);
    const x1 = Math.round((q.x + q.w / 2) * 2);
    const y0 = Math.round((q.y - q.h / 2) * 2);
    const y1 = Math.round((q.y + q.h / 2) * 2);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        for (const sh of [16, 8, 0]) {
          const k = `${x},${y},${sh}`;
          out.set(k, (out.get(k) ?? 0) + Math.round(((q.rgb >> sh) & 255) * q.a * 1000));
        }
      }
    }
  }
  return out;
}

/** What `drawBolts` pushed for one cell before cells were stacked. */
function cell(
  b: QuadBatch,
  cx: number,
  cy: number,
  branch: boolean,
  s: number,
  fade: number,
): void {
  const x = cx + 0.5;
  const y = cy + 0.5;
  const core = Math.max(1, Math.round(s) * 2 - 1);
  if (branch) {
    b.push(x, y, Math.round(3 * s), s > 1.5 ? 2 : 1, 0x4060c0, 0.4 * fade);
    b.push(x, y, Math.round(s), 1, 0xb0c8ff, 0.75 * fade);
  } else {
    b.push(x, y, Math.round(7 * s), s > 1.5 ? 2 : 1, 0x3050c0, 0.45 * fade);
    b.push(x, y, Math.round(3 * s), 1, 0xd0e0ff, 0.9 * fade);
    b.push(x, y, core, 1, 0xffffff, fade);
  }
}

describe('boltStack', () => {
  it('lights the same cells as one quad set per cell', () => {
    for (const s of [1, 1.2, 1.6, 2.2]) {
      for (const branch of [false, true]) {
        for (const n of [1, 2, 3, 9]) {
          const one = batch();
          for (let j = 0; j < n; j++) cell(one.batch, 7, 20 + j, branch, s, 0.75);
          const all = batch();
          boltStack(all.batch, 7, 20, n, branch, s, Math.max(1, Math.round(s) * 2 - 1), 0.75);
          expect(light(all.quads)).toEqual(light(one.quads));
          expect(all.quads.length).toBeLessThanOrEqual(one.quads.length);
        }
      }
    }
  });
});
