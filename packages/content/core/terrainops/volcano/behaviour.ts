import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp, toFixed, type OpCall, type SimApi } from '@mudders/sim';

const materialId = ContentIdSchema.refine(
  (id) => id.startsWith('material.'),
  'must be a material.* id',
);

const params = z.strictObject({
  /** `grow` raises the cone; `erupt` spits lava out of its crater (re-run every turn by a zone). */
  mode: z.enum(['grow', 'erupt']),
  /** What the cone is built of, and what the crater fills with and the vent spits. */
  cone: materialId,
  lava: materialId,
  /** Cone height at the rim, cells; the radius comes from the call. */
  height: z.number().int().min(4).max(120),
  /** Crater: half-width and depth below the rim, cells. */
  craterRadius: z.number().int().min(1).max(30),
  craterDepth: z.number().int().min(1).max(30),
  /** Ticks the cone takes to rise, or the eruption lasts. */
  ticks: z.number().int().min(1).max(240),
  /** Erupt: lava cells spat per tick, and how many of them pour over the rim instead. */
  rate: z.number().int().min(0).max(64),
  pour: z.number().int().min(0).max(16),
  /** Erupt: upward launch speed range and the widest sideways speed, cells/tick. */
  minSpeed: z.number().min(0.2).max(10),
  maxSpeed: z.number().min(0.2).max(10),
  spread: z.number().min(0).max(6),
});
export type Params = z.infer<typeof params>;

/**
 * Rim-to-flank profile: full `height` at the rim, falling off to 0 at `R` along a slightly
 * concave slope (steeper near the top, like a cinder cone). The crater is cut out of the top.
 */
function coneHeight(p: Params, R: number, dx: number): number {
  const a = Math.abs(dx);
  if (a >= R) return 0;
  const rim = Math.min(p.craterRadius + 1, R - 1);
  if (a <= rim) {
    // bowl: rim at full height, floor craterDepth lower, linear walls
    const floor = p.height - p.craterDepth;
    return floor + Math.trunc((p.craterDepth * a) / Math.max(1, rim));
  }
  // flank: (1 - t)^1.5-ish in integers, t = 0 at the rim, 1 at the foot
  const span = Math.max(1, R - rim);
  const u = ((R - a) * 256) / span; // 256 at the rim, 0 at the foot
  const s = (u * u) >> 8; // concave
  return Math.trunc((p.height * ((s + u) >> 1)) / 256);
}

/**
 * Final top row of the cone at offset `dx` from the vent, given `base`, the ground row under the
 * seed. The flank keeps going below `base` at its foot slope (out to 2R), so on a hillside the
 * cone stands level, merges into the slope uphill and skirts down it downhill without a cliff.
 */
function coneTop(p: Params, R: number, base: number, dx: number): number {
  const a = Math.abs(dx);
  if (a < R) return base - coneHeight(p, R, dx);
  const span = Math.max(1, R - Math.min(p.craterRadius + 1, R - 1));
  return base + Math.trunc(((a - R + 1) * p.height) / (2 * span));
}

/**
 * One tick of growth: every column under the cone rises by up to `step` cells toward its final
 * top, so the whole cone pushes up together and the peak finishes last. Returns false once no
 * column moved.
 */
function grow(api: SimApi, p: Params, c: OpCall, base: number): boolean {
  const g = api.grid;
  const W = g.width;
  const R = c.radius;
  const cell = api.mats.cellOf(p.cone);
  const step = Math.trunc((p.height + p.ticks - 1) / p.ticks) + 1;
  let minY = g.height;
  let moved = false;
  const x0 = Math.max(0, c.x - 2 * R);
  const x1 = Math.min(W - 1, c.x + 2 * R);
  for (let x = x0; x <= x1; x++) {
    const top = Math.max(1, coneTop(p, R, base, x - c.x));
    for (let n = 0; n < step; n++) {
      const s = g.surfaceY(x);
      if (s <= top) break;
      const i = (s - 1) * W + x;
      g.material[i] = cell;
      g.cellState[i] = 0;
      g.fallVel[i] = 0;
      moved = true;
      if (s - 1 < minY) minY = s - 1;
    }
  }
  if (minY < g.height) g.markDirty(x0, minY, x1, g.height - 1);
  // tanks ride the slope up instead of being buried in it
  for (const t of api.tanks) {
    if (!t.alive || t.x + t.half < x0 || t.x - t.half > x1) continue;
    let y = g.height;
    for (let x = Math.max(0, t.x - t.half); x <= Math.min(W - 1, t.x + t.half); x++) {
      y = Math.min(y, g.surfaceY(x));
    }
    if (y < t.y) t.y = y;
  }
  return moved;
}

/** Fill the crater bowl with lava up to just under the rim. */
function fillCrater(api: SimApi, p: Params, c: OpCall): void {
  const g = api.grid;
  const W = g.width;
  const lava = api.mats.cellOf(p.lava);
  const rimY = vent(api, c.x - p.craterRadius - 1);
  let minY = g.height;
  for (let x = c.x - p.craterRadius; x <= c.x + p.craterRadius; x++) {
    if (x < 0 || x >= W) continue;
    for (let y = g.surfaceY(x) - 1; y > rimY && y > 0; y--) {
      const i = y * W + x;
      if (g.material[i] !== 0) break;
      g.material[i] = lava;
      g.cellState[i] = 0;
      g.fallVel[i] = 0;
      if (y < minY) minY = y;
    }
  }
  if (minY < g.height)
    g.markDirty(c.x - p.craterRadius, minY, c.x + p.craterRadius, minY + p.craterDepth + 2);
}

/** Top solid row of column x (the map height if the column is empty). */
function vent(api: SimApi, x: number): number {
  const g = api.grid;
  if (x < 0 || x >= g.width) return g.height;
  return g.surfaceY(x);
}

/** One tick of eruption: lava cells spat up out of the crater, and some poured over the rim. */
function spit(api: SimApi, p: Params, c: OpCall, t: number): void {
  const g = api.grid;
  const W = g.width;
  const rng = api.rng;
  const lava = api.mats.cellOf(p.lava);
  // a strong first gout, sputtering down toward the end
  const k = p.ticks <= 1 ? 0 : Math.trunc((t * 256) / (p.ticks - 1));
  const power = t < 4 ? 256 : 256 - ((k * 3) >> 2);
  const n = t < 4 ? p.rate * 2 : Math.max(1, Math.trunc((p.rate * power) / 256));
  const vMin = toFixed(p.minSpeed);
  const vMax = toFixed(p.maxSpeed);
  const side = toFixed(p.spread);
  let minX = W;
  let maxX = -1;
  let minY = g.height;
  for (let j = 0; j < n + p.pour; j++) {
    const pour = j >= n;
    const x = c.x + rng.range(-p.craterRadius + 1, p.craterRadius - 1);
    if (x < 0 || x >= W) continue;
    const s = g.surfaceY(x);
    if (s <= 1) continue;
    const i = (s - 1) * W + x;
    if (g.material[i] !== 0) continue;
    let vx: number;
    let vy: number;
    if (pour) {
      // slops over the rim and runs down the flank
      vx = (rng.int(2) === 0 ? -1 : 1) * (toFixed(0.5) + rng.int(toFixed(0.6)));
      vy = -toFixed(0.9) - rng.int(toFixed(0.6));
    } else {
      const up = vMin + rng.int(vMax - vMin + 1);
      vy = -Math.trunc((up * power) / 256) - toFixed(0.6);
      vx = rng.range(-side, side);
    }
    g.material[i] = lava;
    g.cellState[i] = 0;
    g.fallVel[i] = 0;
    if (!api.launch(i, vx, vy)) {
      g.material[i] = 0;
      break; // debris pool is full
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (s - 1 < minY) minY = s - 1;
  }
  if (maxX >= 0) g.markDirty(minX, minY, maxX, minY + 1);
}

/**
 * Volcano (Volcano Seed). `grow` raises a cinder cone with a lava-filled crater a few rows per
 * tick (tanks ride it up). `erupt` is what the seed's zone re-runs at the end of each turn: for
 * `ticks` ticks the crater spits real lava cells into the air as sim debris and slops some over
 * the rim, so the lava lands, runs downhill, pools, burns tanks and cools to rock like any lava.
 * The vent is found fresh each time (the top of the column), so a blasted cone still erupts.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.volcano',
  version: 1,
  params,
  start(api, p, c) {
    if (p.mode === 'grow') {
      api.emit('volcanoGrow', c.x, vent(api, c.x), c.radius, {
        height: p.height,
        ticks: p.ticks,
      });
      const base = vent(api, c.x);
      if (!grow(api, p, c, base)) {
        fillCrater(api, p, c);
        return null;
      }
      return [base];
    }
    api.emit('volcanoErupt', c.x, vent(api, c.x), p.craterRadius, {
      ticks: p.ticks,
      speed: p.maxSpeed,
    });
    spit(api, p, c, 0);
    return p.ticks > 1 ? [] : null;
  },
  step(api, p, inst) {
    // inst.t counts from 1 on the first step
    if (p.mode === 'grow') {
      // a deep hillside skirt may take longer than `ticks`; never more than double
      if (!grow(api, p, inst.call, inst.data[0]!) || inst.t >= 2 * p.ticks) {
        fillCrater(api, p, inst.call);
        return false;
      }
      return true;
    }
    if (inst.t >= p.ticks) return false;
    spit(api, p, inst.call, inst.t);
    return inst.t + 1 < p.ticks;
  },
});
