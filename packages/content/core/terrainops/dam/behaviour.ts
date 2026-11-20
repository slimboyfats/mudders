import { ContentIdSchema, z } from '@mudders/shared';
import { SETTLE_FLOW, defineTerrainOp, type SimApi } from '@mudders/sim';

const materialId = ContentIdSchema.refine(
  (id) => id.startsWith('material.'),
  'must be a material.* id',
);

const params = z.strictObject({
  /** What the dam is built of, and what it holds back. */
  wall: materialId,
  water: materialId,
  /** Heights to try, tallest first: rows from the dam's foot to the water line. */
  heights: z.array(z.number().int().min(6).max(80)).min(1).max(6),
  /** Thickness of the crest, cells; the downstream face slopes out from it two rows a cell. */
  crest: z.number().int().min(2).max(16),
  /** Rows of dry wall above the water line. */
  freeboard: z.number().int().min(0).max(8),
  /** Rows the dam is keyed into the ground under it. */
  key: z.number().int().min(0).max(16),
  /** The ground downstream must lie at least this many rows below the dam's foot. */
  drop: z.number().int().min(0).max(80),
  /** Lake size: columns, and cells of water. */
  minWidth: z.number().int().min(4).max(800),
  maxWidth: z.number().int().min(4).max(800),
  minCells: z.number().int().min(1).max(100_000),
  maxCells: z.number().int().min(1).max(100_000),
  /** Columns kept clear of the map's sides, and of any tank. */
  margin: z.number().int().min(0).max(400),
  clear: z.number().int().min(0).max(400),
});
type Params = z.infer<typeof params>;

/** Top row of real ground in column x: the first solid cell that is not a prop or a liquid. */
function groundY(api: SimApi, x: number): number {
  const g = api.grid;
  const W = g.width;
  const settle = api.mats.settle;
  for (let y = g.surfaceY(x), i = y * W + x; y < g.height; y++, i += W) {
    const m = g.material[i]!;
    if (m !== 0 && g.group[i] === 0 && settle[m] !== SETTLE_FLOW) return y;
  }
  return g.height;
}

/** Per column, ground row and whether a prop or liquid stands on it; grown to the map, reused. */
let ground = new Int32Array(0);
let busy = new Uint8Array(0);

function survey(api: SimApi): void {
  const g = api.grid;
  const W = g.width;
  const settle = api.mats.settle;
  if (ground.length !== W) {
    ground = new Int32Array(W);
    busy = new Uint8Array(W);
  }
  for (let x = 0; x < W; x++) {
    const gy = groundY(api, x);
    ground[x] = gy;
    let b = 0;
    for (let y = g.surfaceY(x), i = y * W + x; y < gy; y++, i += W) {
      const m = g.material[i]!;
      if (g.group[i] !== 0 || (m !== 0 && settle[m] === SETTLE_FLOW)) b = 1;
    }
    busy[x] = b;
  }
}

/** Where a dam goes: wall column, side the lake lies on, water line row and lake width. */
interface Site {
  x: number;
  dir: number;
  level: number;
  width: number;
  cells: number;
}

/**
 * A lake behind a wall at column x (lake on the side opposite `dir`), with its water line `h`
 * rows above the ground there: the lake runs upstream until the ground rises to the water line.
 * Null when the valley does not close within `maxWidth`, the lake is too small or too big, the
 * ground downstream does not fall away, or a tank or prop stands in it.
 */
function siteAt(api: SimApi, p: Params, x: number, dir: number, h: number): Site | null {
  const g = api.grid;
  const W = g.width;
  const foot = ground[x]!;
  const level = foot - h;
  if (level - p.freeboard < 8) return null;
  const below = x + dir * (p.crest + (h >> 1) + 4);
  if (below < 1 || below >= W - 1 || ground[below]! < foot + p.drop) return null;
  let c = x - dir;
  let width = 0;
  let cells = 0;
  for (;;) {
    if (c < p.margin || c >= W - p.margin) return null;
    const gy = ground[c]!;
    if (gy <= level) break;
    if (busy[c] !== 0) return null;
    width++;
    cells += gy - level;
    if (width > p.maxWidth || cells > p.maxCells) return null;
    c -= dir;
  }
  if (width < p.minWidth || cells < p.minCells) return null;
  for (let k = 0; k <= p.crest + (h >> 1); k++) if (busy[x + dir * k] !== 0) return null;
  const lo = Math.min(c, x + dir * (p.crest + (h >> 1)));
  const hi = Math.max(c, x + dir * (p.crest + (h >> 1)));
  for (const t of api.tanks) if (t.alive && t.x >= lo - p.clear && t.x <= hi + p.clear) return null;
  return { x, dir, level, width, cells };
}

/** The site holding the most water, at the tallest height that has one; null when none. */
function pickSite(api: SimApi, p: Params): Site | null {
  const W = api.grid.width;
  survey(api);
  for (const h of p.heights) {
    let best: Site | null = null;
    let most = 0;
    for (let x = p.margin; x < W - p.margin; x += 2) {
      for (let dir = -1; dir <= 1; dir += 2) {
        const s = siteAt(api, p, x, dir, h);
        if (s !== null && s.cells > most) {
          best = s;
          most = s.cells;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

/**
 * A dam (map event). On a fresh map a concrete dam is built across the deepest valley that will
 * hold a lake clear of every tank and prop: a wall keyed into the valley floor where the ground
 * falls away downstream, with a lake of real water filling the valley behind it up to just under
 * its crest. The dam is plain terrain: a shell that cracks it open lets the lake out through the
 * hole, and the water runs downhill with its own weight and momentum, flooding what lies below.
 * Builds once per round and then is done; nothing happens on a map with no such valley.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.dam',
  version: 1,
  params,
  start(api, p) {
    const g = api.grid;
    const W = g.width;
    const best = pickSite(api, p);
    if (best === null) return null;
    const { x, dir, level } = best;
    const wallMat = api.mats.cellOf(p.wall);
    const water = api.mats.cellOf(p.water);
    const mat = g.material;
    const top = level - p.freeboard;
    let minX = x;
    let maxX = x;
    let maxY = top;
    // the wall: a crest `crest` cells thick, the downstream face sloping out two rows a cell,
    // each column down to `key` rows into its own ground
    for (let k = 0; k < 64; k++) {
      const cx = x + dir * k;
      if (cx < 0 || cx >= W) break;
      const from = top + Math.max(0, (k - p.crest + 1) * 2);
      const to = Math.min(g.height - 1, groundY(api, cx) + p.key);
      if (from > to - p.key) break;
      for (let y = from, i = y * W + cx; y <= to; y++, i += W) {
        g.leaveGroup(i);
        mat[i] = wallMat;
        g.cellState[i] = 0;
      }
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (to > maxY) maxY = to;
    }
    // the lake behind it, up to the water line
    for (let c = x - dir; ; c -= dir) {
      const gy = groundY(api, c);
      if (gy <= level) break;
      for (let y = level, i = y * W + c; y < gy; y++, i += W) if (mat[i] === 0) mat[i] = water;
      if (c < minX) minX = c;
      if (c > maxX) maxX = c;
      if (gy > maxY) maxY = gy;
    }
    g.markDirty(minX, top, maxX, maxY);
    return null;
  },
});
