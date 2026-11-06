import { z } from '@mudders/shared';
import { defineGenerator } from '@mudders/sim';
import { noise1d } from '../hills/behaviour';

const params = z.strictObject({
  /** Mean height of the ground far below the islands, fraction of map height from the top. */
  floorLevel: z.number().min(0.6).max(0.98),
  /** Range of island top rows for the tanks' islands, fractions of map height. */
  topMin: z.number().min(0.1).max(0.8),
  topMax: z.number().min(0.1).max(0.8),
  /** Island thickness at its middle, fraction of map height. */
  thickness: z.number().min(0.03).max(0.4),
  /** Dirt over the island's stone core, in cells. */
  soil: z.number().int().min(1).max(40),
  /** Half width of a tank's island as a fraction of the gap between tanks, and its bounds. */
  islandShare: z.number().min(0.1).max(0.5),
  minHalf: z.number().int().min(14).max(200),
  maxHalf: z.number().int().min(14).max(200),
  /** Extra islands without a tank, per 1000 columns: [min, max]. */
  extra: z.tuple([z.number().int().min(0).max(16), z.number().int().min(0).max(16)]),
  /** Fraction of the width kept free of tanks at each edge. */
  spawnMargin: z.number().min(0).max(0.4),
});
type Params = z.infer<typeof params>;

/**
 * Floating islands (§4b) over a deep gap with low ground at the bottom. Each tank gets its own
 * island; smaller ones float between them as cover. An island is a lens of dirt (grass on top)
 * over a static floatstone core, so it hangs in the air until its stone is shot away and the dirt
 * above pours down. Integer maths only.
 */
export default defineGenerator<Params>({
  kind: 'gen',
  id: 'gen.islands',
  version: 1,
  params,
  generate(api, p, players) {
    const { grid, rng, mats } = api;
    const W = grid.width;
    const H = grid.height;
    const mat = grid.material;
    const dirt = mats.cellOf('material.dirt');
    const rock = mats.cellOf('material.rock');
    const stone = mats.cellOf('material.floatstone');

    // The ground far below: a low, rocky floor that only catches what falls.
    const floorN = noise1d(rng, W, Math.round(0.03 * H * 256), 3, 0.5, 4);
    const floorTop = Math.round(p.floorLevel * H);
    for (let x = 0; x < W; x++) {
      const s = Math.max(floorTop - 20, Math.min(H - 4, floorTop - Math.trunc(floorN[x]! / 256)));
      for (let y = s; y < H; y++) mat[y * W + x] = y < s + 6 ? dirt : rock;
    }

    // Spawns as on the hills: evenly spaced with a little jitter.
    const spawns: number[] = [];
    const margin = Math.floor(W * p.spawnMargin) + 8;
    const span = W - 2 * margin;
    const spacing = players > 1 ? span / (players - 1) : span;
    for (let i = 0; i < players; i++) {
      const j = Math.floor(spacing / 12);
      const jitter = players > 1 ? rng.range(-j, j) : 0;
      const x = players > 1 ? Math.round(margin + i * spacing) + jitter : Math.floor(W / 2);
      spawns.push(Math.max(margin, Math.min(W - margin, x)));
    }
    rng.shuffle(spawns);

    const thick = Math.round(p.thickness * H);
    const edge = noise1d(rng, W, 3 * 256, 2, 0.5, 24);
    const under = noise1d(rng, W, 6 * 256, 2, 0.6, 30);
    /** Draw one island: columns cx±half, top row `top`, middle thickness `t`, flat pad at `pad`. */
    const island = (cx: number, half: number, top: number, t: number, pad: number): void => {
      for (let x = Math.max(0, cx - half); x <= Math.min(W - 1, cx + half); x++) {
        const d = x < cx ? cx - x : x - cx;
        const u = Math.floor((d * 256) / half); // 0 at the middle, 256 at the tips
        const u2 = (u * u) >> 8;
        // the top bows down a little towards the tips, the underside tapers to a point
        let y0 = top + ((u2 * u) >> 13) + Math.trunc(edge[x]! / 256);
        if (pad >= 0 && x >= pad - 11 && x <= pad + 11) y0 = top;
        const depth = Math.trunc((t * (256 - u2)) / 256) + Math.trunc(under[x]! / 256);
        const y1 = Math.min(floorTop - 24, y0 + Math.max(3, depth));
        for (let y = Math.max(1, y0); y < y1; y++) {
          mat[y * W + x] = y < y0 + p.soil && y < y1 - 2 ? dirt : stone;
        }
      }
    };

    const halfOf = Math.max(p.minHalf, Math.min(p.maxHalf, Math.round(spacing * p.islandShare)));
    const topLo = Math.round(p.topMin * H);
    const topHi = Math.max(topLo, Math.round(p.topMax * H));
    for (const sx of spawns) {
      const half = halfOf + rng.range(-4, 6);
      // the tank stands off-centre but always well inside its island
      const cx = sx + rng.range(-(half >> 2), half >> 2);
      island(cx, half, rng.range(topLo, topHi), thick + rng.range(-thick >> 3, thick >> 3), sx);
    }

    // Small islands between and above: never over a tank's spawn column.
    const scale = W / 1000;
    const n = rng.range(Math.round(p.extra[0] * scale), Math.round(p.extra[1] * scale));
    for (let i = 0; i < n; i++) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const half = rng.range(16, Math.max(17, halfOf >> 1));
        const cx = rng.range(half + 4, W - half - 5);
        let clear = true;
        for (const sx of spawns) if (sx > cx - half - 16 && sx < cx + half + 16) clear = false;
        if (!clear) continue;
        const top = rng.range(Math.round(0.14 * H), Math.max(Math.round(0.15 * H), topHi - 10));
        island(cx, half, top, Math.max(8, thick >> 1), -1);
        break;
      }
    }
    return { spawns };
  },
});
