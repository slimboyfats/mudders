import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp, toFixed, type SimApi } from '@mudders/sim';

const materialId = ContentIdSchema.refine(
  (id) => id.startsWith('material.'),
  'must be a material.* id',
);

const params = z.strictObject({
  /** What a slab breaks into as it lets go: taken material → falling material. */
  into: z.record(materialId, materialId),
  /** Slab: columns wide and cells deep. */
  width: z.number().int().min(4).max(120),
  depth: z.number().int().min(1).max(20),
  /** The slope it lets go on: rows of drop over `run` columns, at least. */
  drop: z.number().int().min(1).max(60),
  run: z.number().int().min(2).max(40),
  /** Keep the slab's top at least this many columns from the map edges. */
  margin: z.number().int().min(0).max(400),
  /** Turns before the first slide can come, then between slides (both ends inclusive). */
  first: z.number().int().min(1).max(40),
  every: z.tuple([z.number().int().min(1).max(40), z.number().int().min(1).max(40)]),
  /** Launch speed downhill (cells/tick) and its spread, and the small hop it lets go with. */
  speed: z.number().min(0.1).max(6),
  spread: z.number().min(0).max(3),
  hop: z.number().min(0).max(3),
  /** Hurt dealt to a tank in the run-out below the slab, and how far down the slope that reaches. */
  damage: z.number().int().min(0).max(100),
  reach: z.number().int().min(0).max(400),
  shake: z.number().min(0).max(4),
  /**
   * Ticks the slide keeps running after it lets go: loose cells lying on the slope below keep
   * tumbling downhill instead of resting at their angle of repose, until they reach level ground.
   */
  flow: z.number().int().min(0).max(240),
});
type Params = z.infer<typeof params>;

const NEXT = 0;
const LAST = 1;
const FLOW_T = 2;
const FLOW_X = 3;
const FLOW_DIR = 4;

/** Taken material index → falling material index (0 = not taken), built on first use per call. */
function intoTable(api: SimApi, p: Params): Uint8Array {
  const t = new Uint8Array(256);
  for (const from of Object.keys(p.into).sort()) {
    t[api.mats.cellOf(from)] = api.mats.cellOf(p.into[from]!);
  }
  return t;
}

/**
 * Columns where the ground falls away by at least `drop` rows over `run` columns, steepest
 * first; one of the few steepest is picked at random. Returns the slab's top column and the way
 * downhill, or null on a map with no steep snowy slope.
 */
function pickSlope(api: SimApi, p: Params, into: Uint8Array): { x: number; dir: -1 | 1 } | null {
  const g = api.grid;
  const W = g.width;
  const found: number[] = [];
  for (let x = Math.max(p.run, p.margin); x < W - Math.max(p.run, p.margin); x += 3) {
    const y = g.surfaceY(x);
    if (y >= g.height || into[g.material[y * W + x]!] === 0) continue;
    const l = g.surfaceY(x - p.run) - y;
    const r = g.surfaceY(x + p.run) - y;
    const dir: -1 | 1 = r >= l ? 1 : -1;
    const fall = Math.max(l, r);
    if (fall >= p.drop) found.push(fall * 4096 + x * 2 + (dir > 0 ? 1 : 0));
  }
  if (found.length === 0) return null;
  found.sort((a, b) => b - a);
  const k = found[api.rng.int(Math.min(4, found.length))]!;
  return { x: (k % 4096) >> 1, dir: k & 1 ? 1 : -1 };
}

/** The slab lets go: its cells turn into falling snow (or ice shards) and slide down the slope. */
function slide(api: SimApi, p: Params, into: Uint8Array, x0: number, dir: -1 | 1): number {
  const g = api.grid;
  const W = g.width;
  const rng = api.rng;
  const vx0 = toFixed(p.speed);
  const sp = toFixed(p.spread);
  const hop = toFixed(p.hop);
  let n = 0;
  let minX = W;
  let maxX = -1;
  let minY = g.height;
  let maxY = -1;
  for (let k = 0; k < p.width; k++) {
    const x = x0 + dir * k;
    if (x < 1 || x >= W - 1) break;
    const s = g.surfaceY(x);
    for (let d = 0; d < p.depth; d++) {
      const y = s + d;
      if (y >= g.height) break;
      const i = y * W + x;
      const m = into[g.material[i]!]!;
      if (m === 0) break;
      g.material[i] = m;
      g.cellState[i] = 0;
      g.fallVel[i] = 0;
      // the top of the slab runs fastest; it all lets go downhill with a small hop
      const vx = dir * (vx0 - ((vx0 * d) >> 3)) + rng.range(-sp, sp);
      const vy = -rng.int(hop + 1);
      if (!api.launch(i, vx, vy)) {
        g.material[i] = 0;
        g.markDirty(x, y, x, y);
        continue;
      }
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  // the slab runs down a slope: dirty every row it left, not just the top few
  if (maxX >= 0) g.markDirty(minX, minY, maxX, maxY);
  return n;
}

/**
 * One tick of the running slide: every loose top cell on the run from `x0` that has lower ground
 * just downhill of it is shoved off down the slope. Returns how many moved.
 */
function tumble(api: SimApi, p: Params, moving: Uint8Array, x0: number, dir: number): number {
  const g = api.grid;
  const W = g.width;
  const rng = api.rng;
  const vx0 = toFixed(p.speed);
  const sp = toFixed(p.spread);
  let n = 0;
  const span = p.width + p.reach;
  for (let k = 0; k < span; k++) {
    const x = x0 + dir * k;
    const nx = x + dir;
    if (x < 1 || nx < 1 || x >= W - 1 || nx >= W - 1) break;
    const s = g.surfaceY(x);
    if (s >= g.height) continue;
    const i = s * W + x;
    if (moving[g.material[i]!] === 0) continue;
    // only where the ground falls away downhill: on the level the heap comes to rest
    if (g.surfaceY(nx) <= s) continue;
    if (!api.launch(i, dir * (vx0 >> 1) + rng.range(-sp, sp), -rng.int(toFixed(0.3) + 1))) break;
    g.markDirty(x, s, x, s);
    n++;
  }
  return n;
}

/**
 * Avalanches (map event, Glacier). Every few turns, at the start of a turn, a slab of snow and
 * ice lets go near the top of one of the steepest slopes: its cells turn into falling snow and
 * ice shards that slide and tumble down the hill as real matter, piling up in the valley below
 * and burying whatever is there. A tank in the run-out below takes a hit. Never holds up a turn.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.avalanche',
  version: 1,
  params,
  start(api, p) {
    return [api.turn + p.first, api.turn, 0, 0, 1];
  },
  step(api, p, inst) {
    const d = inst.data;
    if (d[FLOW_T]! > 0) {
      d[FLOW_T] = d[FLOW_T]! - 1;
      const moving = new Uint8Array(256);
      for (const id of Object.keys(p.into).sort()) moving[api.mats.cellOf(p.into[id]!)] = 1;
      tumble(api, p, moving, d[FLOW_X]!, d[FLOW_DIR]!);
    }
    if (api.turn === d[LAST]) return 'idle';
    d[LAST] = api.turn;
    if (api.turn < d[NEXT]!) return 'idle';
    d[NEXT] = api.turn + api.rng.range(p.every[0], Math.max(p.every[0], p.every[1]));
    const into = intoTable(api, p);
    const at = pickSlope(api, p, into);
    if (!at) return 'idle';
    const y = api.grid.surfaceY(at.x);
    if (slide(api, p, into, at.x - at.dir * (p.width >> 1), at.dir) === 0) return 'idle';
    d[FLOW_T] = p.flow;
    d[FLOW_X] = at.x - at.dir * (p.width >> 1);
    d[FLOW_DIR] = at.dir;
    api.emit('avalanche', at.x, y, p.width, { dir: at.dir });
    api.emit('shake', at.x, y, p.width, { strength: p.shake });
    for (const t of api.tanks) {
      const ahead = (t.x - at.x) * at.dir;
      if (t.alive && ahead >= 0 && ahead <= p.reach && t.y > y) api.hurt(t.player, p.damage, -1);
    }
    return 'idle';
  },
});
