import { ContentIdSchema, z } from '@mudders/shared';
import { DECI, FP, cosDeci, defineTerrainOp, sinDeci, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Crystal the spires are made of. */
  material: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** Spires in the bloom, and the fan they spread over either side of straight up, degrees. */
  spires: z.number().int().min(1).max(16),
  fan: z.number().int().min(0).max(85),
  /** Spire length range, cells (the middle ones grow longest). */
  minLen: z.number().int().min(4).max(300),
  maxLen: z.number().int().min(4).max(300),
  /** Half-width at the base of a full-length spire, cells; they taper to a point. */
  half: z.number().int().min(1).max(20),
  /** Cells a spire grows per tick at first; it slows down to a crawl as it reaches full length. */
  speed: z.number().int().min(1).max(20),
  /** Rows below the impact the spires start from (they burst up through the ground). */
  root: z.number().int().min(0).max(40),
  /** Damage when a spire skewers a tank (once per tank per spire, at most `maxHits` per tank). */
  damage: z.number().int().min(0).max(400),
  maxHits: z.number().int().min(1).max(8),
});
type Params = z.infer<typeof params>;

// header
const AGE = 0;
const ROOT_X = 1;
const ROOT_Y = 2;
const COUNT = 3;
const HEAD = 4;
// per spire: dirX, dirY (FP), length, half (×2 for half cells), grown (×2), tank carried (+1)
const SP = 6;
// after the spires, per tank: hits taken, and the spire carrying it (+1)

function inTank(api: SimApi, x: number, y: number): number {
  for (const t of api.tanks) {
    if (!t.alive) continue;
    if (x >= t.x - t.half && x <= t.x + t.half && y > t.y - t.h - 1 && y <= t.y) return t.player;
  }
  return -1;
}

/**
 * Crystal Bloom: a cluster of huge crystal spires bursts up out of the ground where it lands and
 * grows out in a fan, fast at first and then creeping to full length. They are real terrain (the
 * crystal stays: lasers bounce off it, blasts shatter it into shards, an undermined spire can
 * break off and fall). A spire that grows into a tank skewers it, hurts it and carries it up on its
 * tip. Objects (trees, houses) are left whole; the spires grow around them.
 *
 * Emits `bloomStart`, `bloomTip` (each growing tip, every other tick), `bloomImpale` and
 * `bloomDone`.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.crystal-bloom',
  version: 1,
  params,
  start(api, p, c) {
    const n = p.spires;
    const d = [0, c.x, Math.min(api.grid.height - 1, c.y + p.root), n];
    for (let k = 0; k < n; k++) {
      // evenly over the fan, jittered, so it never looks like a comb
      const even = n === 1 ? 0 : Math.trunc((2 * p.fan * DECI * k) / (n - 1)) - p.fan * DECI;
      const a = even + api.rng.int(9 * DECI) - 4 * DECI;
      const off = Math.abs(a);
      // the middle spires grow longest
      const span = p.maxLen - p.minLen;
      const long =
        p.minLen + Math.trunc((span * (p.fan * DECI + DECI - off)) / (p.fan * DECI + DECI));
      const len = Math.max(p.minLen, long - api.rng.int(Math.max(1, (span >> 2) + 1)));
      const half = Math.max(2, Math.trunc((2 * p.half * len) / Math.max(1, p.maxLen)));
      d.push(sinDeci(a), -cosDeci(a), len, half, 0, 0);
    }
    for (let k = 0; k < api.tanks.length; k++) d.push(0, 0);
    api.emit('bloomStart', c.x, c.y, p.maxLen, { spires: n });
    return d;
  },
  step(api, p, inst) {
    const d = inst.data;
    const g = api.grid;
    const W = g.width;
    const H = g.height;
    const cell = api.mats.cellOf(p.material);
    const age = d[AGE]! + 1;
    d[AGE] = age;
    const rx = d[ROOT_X]!;
    const ry = d[ROOT_Y]!;
    const n = d[COUNT]!;
    const tanksAt = HEAD + n * SP;
    let busy = false;
    let x0 = W;
    let x1 = -1;
    let y0 = H;
    let y1 = -1;
    for (let k = 0; k < n; k++) {
      const s = HEAD + k * SP;
      const dx = d[s]!;
      const dy = d[s + 1]!;
      const len2 = d[s + 2]! * 2;
      const half2 = d[s + 3]!;
      const was = d[s + 4]!;
      if (was >= len2) continue;
      busy = true;
      // fast at first, creeping at the end (in half cells)
      const left = len2 - was;
      const stepBy = Math.max(1, Math.min(2 * p.speed, Math.trunc((left * p.speed) / 24) + 1));
      const grown = Math.min(len2, was + stepBy);
      // the whole spike scales up as it grows, so it is pointed all the way: the cross-section at
      // distance a from the root is half2 × (grown − a) / len2 either side
      for (let a = 0; a < grown; a++) {
        const w2 = Math.trunc((half2 * (grown - a)) / len2);
        for (let u = -w2; u <= w2; u++) {
          // centre plus along-axis and across-axis offsets, in half cells
          const fx = rx * FP + (FP >> 1) + ((dx * a) >> 1) - ((dy * u) >> 1);
          const fy = ry * FP + (FP >> 1) + ((dy * a) >> 1) + ((dx * u) >> 1);
          const x = Math.floor(fx / FP);
          const y = Math.floor(fy / FP);
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          const i = y * W + x;
          if (g.material[i] === cell || g.group[i] !== 0) continue;
          const tank = inTank(api, x, y);
          if (tank >= 0) {
            const hits = tanksAt + 2 * tank;
            // skewered: hurt it once and carry it on the tip from here on
            if (d[s + 5] === 0 && d[hits + 1] === 0 && d[hits]! < p.maxHits) {
              if (api.tanks[tank]!.glue === 0) {
                d[s + 5] = tank + 1;
                d[hits + 1] = k + 1;
              }
              d[hits] = d[hits]! + 1;
              api.hurt(tank, p.damage, inst.call.owner);
              api.emit('bloomImpale', x, y, 6, { player: tank });
            }
            continue;
          }
          g.material[i] = cell;
          g.coating[i] = 0;
          g.cellState[i] = 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      d[s + 4] = grown;
      const tx = Math.floor((rx * FP + (FP >> 1) + ((dx * grown) >> 1)) / FP);
      const ty = Math.floor((ry * FP + (FP >> 1) + ((dy * grown) >> 1)) / FP);
      const carried = d[s + 5]! - 1;
      if (carried >= 0) {
        const t = api.tanks[carried];
        if (t && t.alive) api.hold(carried, tx, Math.max(t.h + 1, ty - 1));
        // let go of it once this spire is done
        if (grown >= len2) d[tanksAt + 2 * carried + 1] = 0;
      }
      if ((age & 1) === 0 || grown >= len2)
        api.emit('bloomTip', tx, ty, Math.max(1, half2 >> 1), { done: grown >= len2 ? 1 : 0 });
    }
    if (x1 >= x0) g.markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
    if (!busy) {
      api.emit('bloomDone', rx, ry, 0);
      return false;
    }
    return true;
  },
});
