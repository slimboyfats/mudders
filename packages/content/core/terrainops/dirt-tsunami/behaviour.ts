import { FP, z } from '@mudders/shared';
import { SETTLE_STATIC, defineTerrainOp, type SimApi } from '@mudders/sim';

const params = z.strictObject({
  /** Columns the wave front moves per tick. */
  speed: z.number().int().min(1).max(8),
  /** Loose cells the front scoops off the top of every column it rolls over. */
  scoop: z.number().int().min(0).max(16),
  /** Extra cells scooped right next to the impact, fading out over `riseCols` columns. */
  rise: z.number().int().min(0).max(64),
  riseCols: z.number().int().min(1).max(200),
  /** Most cells one wave carries; past this it stops scooping. */
  maxLoad: z.number().int().min(16).max(4000),
  /** Longest crest, in columns (short waves grow into it as they load up). */
  length: z.number().int().min(8).max(120),
  /** Cells flung forward off the crest's top every tick (the breaking lip; they land ahead). */
  spray: z.number().int().min(0).max(16),
  /** Forward throw of the top of the crest when it crashes, cells/tick. */
  crash: z.number().min(0).max(12),
  /** Share of the main wave's reach and scoop given to the smaller backwash. */
  back: z.number().min(0).max(1),
});
type Params = z.infer<typeof params>;

// Per-wave slots in the op's data: front column, cells carried, columns travelled, finished, curl.
const FRONT = 0;
const LOAD = 1;
const DIST = 2;
const DONE = 3;
/** Cells of the load hung out over the face as the curl (not in the crest columns). */
const LIP = 4;
const SLOTS = 5;
/** data[10] = direction of the main wave (+1 / −1); the backwash runs the other way. */
const DIR = SLOTS * 2;

// Scratch for one wave step: the crest's cells between lifting them and setting them down.
const BUF = 4096;
const bufMat = new Uint8Array(BUF);
const bufCoat = new Uint8Array(BUF);
const profile = new Int32Array(128);
/** Air rows a lift steps over inside one column. */
const MAX_GAP = 6;
/** Columns ahead of the face the curl can reach. */
const MAX_CURL = 40;

/** Crest columns for a load: short waves are short, then they grow up to `length`. */
function crestLen(p: Params, load: number): number {
  return Math.min(p.length, 6 + Math.trunc(load / 12));
}

/**
 * Cells per crest column, front (0) to back: a steep face, a peak a sixth of the way back and a
 * long shallow back slope, scaled so the columns hold exactly `load` cells. Integer only.
 */
function shape(p: Params, load: number): number {
  const L = crestLen(p, load);
  const pk = Math.max(1, Math.trunc(L / 6));
  let sum = 0;
  for (let i = 0; i < L; i++) {
    const w = i <= pk ? 550 + Math.trunc((450 * i) / pk) : Math.trunc((1000 * (L - i)) / (L - pk));
    profile[i] = w;
    sum += w;
  }
  let used = 0;
  for (let i = 0; i < L; i++) {
    const e = Math.trunc((load * profile[i]!) / sum);
    profile[i] = e;
    used += e;
  }
  for (let i = 0; used < load; i = (i + 1) % L, used++) profile[i] = profile[i]! + 1;
  return L;
}

/** Can the wave lift this cell? Rock, props and other static ground hold. */
function loose(api: SimApi, idx: number): boolean {
  const m = api.grid.material[idx]!;
  return m !== 0 && api.mats.settle[m] !== SETTLE_STATIC && api.grid.group[idx] === 0;
}

/**
 * Take up to `n` loose cells off the top of column x into the buffer from `k`; returns the new k.
 * Small air gaps (a crest cell toppling off a spire mid-fall) are stepped over; rock, props and
 * other static ground stop it.
 */
function lift(api: SimApi, x: number, n: number, k: number): number {
  const g = api.grid;
  if (x < 0 || x >= g.width) return k;
  let air = 0;
  for (let y = g.surfaceY(x), taken = 0; taken < n && y < g.height && k < BUF; y++) {
    const idx = y * g.width + x;
    if (g.material[idx] === 0) {
      if (++air > MAX_GAP) break;
      continue;
    }
    if (!loose(api, idx)) break;
    bufMat[k] = g.material[idx]!;
    bufCoat[k] = g.coating[idx]!;
    k++;
    taken++;
    g.clearCell(idx);
  }
  return k;
}

/**
 * Take back up to `n` cells of a hanging curl in column x: the top run of cells, if there is air
 * under it (a run that reaches the ground is ground, and stays). Returns the new k.
 */
function reclaim(api: SimApi, x: number, n: number, k: number): number {
  const g = api.grid;
  if (x < 0 || x >= g.width) return k;
  const W = g.width;
  const s = g.surfaceY(x);
  let e = s;
  while (e < g.height && g.material[e * W + x] !== 0) e++;
  if (e >= g.height || e === s) return k;
  for (let y = s; y < e && y < s + n && k < BUF; y++) {
    const idx = y * W + x;
    if (!loose(api, idx)) break;
    bufMat[k] = g.material[idx]!;
    bufCoat[k] = g.coating[idx]!;
    k++;
    g.clearCell(idx);
  }
  return k;
}

/** Highest ground under a tank's footprint. */
function groundUnder(api: SimApi, x: number, half: number): number {
  let top = api.grid.height;
  for (let c = x - half; c < x + half; c++) top = Math.min(top, api.grid.surfaceY(c));
  return top;
}

/**
 * One tick of one wave: lift the whole crest out of the ground, roll the front forward scooping
 * the ground it passes, set the crest down again on the new columns, fling the breaking lip ahead
 * and carry any tank the front has reached. On its last tick the crest crashes forward as debris.
 */
function stepWave(api: SimApi, p: Params, d: number[], o: number, dir: number, back: boolean) {
  const g = api.grid;
  const W = g.width;
  const reach = back ? Math.trunc(d[DIR + 1]! * p.back) : d[DIR + 1]!;
  const scale = back ? p.back : 1;
  let front = d[o + FRONT]!;
  const start = front;
  let load = d[o + LOAD]!;
  let dist = d[o + DIST]!;

  // 1. lift the wave: last tick's curl first (it hangs, or is falling, over and ahead of the
  // face), then the crest (count based, so cells that slumped a row are still picked up)
  const lip = d[o + LIP]!;
  let L = crestLen(p, load - lip);
  let k = 0;
  let left = lip;
  for (let j = 1 - Math.max(1, Math.trunc(L / 6)); j <= MAX_CURL && left > 0; j++) {
    const before = k;
    k = reclaim(api, front + dir * j, left, k);
    left -= k - before;
  }
  L = shape(p, load - lip);
  let peak = 0;
  for (let i = 0; i < L; i++) {
    peak = Math.max(peak, profile[i]!);
    k = lift(api, front - dir * i, profile[i]!, k);
  }
  const x0 = front - dir * (L - 1);

  // 2. roll forward
  let crash = false;
  for (let s = 0; s < p.speed; s++) {
    const nf = front + dir;
    if (nf < 1 || nf >= W - 1 || dist >= reach) {
      crash = true;
      break;
    }
    // a wall higher than most of the crest stops it
    // (not while it is still rising out of its own crater)
    const wall = Math.max(4, Math.trunc((peak * 2) / 3));
    if (dist >= p.riseCols && g.surfaceY(nf) < g.surfaceY(front) - wall) {
      crash = true;
      break;
    }
    front = nf;
    dist++;
    if (k < p.maxLoad) {
      const fresh = dist < p.riseCols ? Math.trunc((p.rise * (p.riseCols - dist)) / p.riseCols) : 0;
      const n = Math.round((p.scoop + fresh) * scale);
      k = lift(api, front, Math.min(n, p.maxLoad - k), k);
    }
  }

  // 3. set the crest down on its new columns, top-down in the order it was lifted
  L = shape(p, k);
  let r = 0;
  let minY = g.height;
  for (let i = 0; i < L; i++) {
    const x = front - dir * i;
    if (x < 0 || x >= W) continue;
    const e = profile[i]!;
    const top = g.surfaceY(x) - e;
    for (let y = top; y < top + e; y++) {
      if (y < 0 || r >= k) continue;
      const idx = y * W + x;
      g.material[idx] = bufMat[r]!;
      g.coating[idx] = bufCoat[r]!;
      g.cellState[idx] = 0;
      g.fallVel[idx] = 0;
      r++;
    }
    if (top < minY) minY = top;
  }
  load = r;
  const x1 = front - dir * (L - 1);
  const lo = Math.min(x0, x1, start, front) - 2;
  const hi = Math.max(x0, x1, start, front) + 2;
  g.markDirty(lo, Math.max(0, minY - 2), hi, g.height - 1);

  // 4. tanks the front has reached ride up on the crest and are pushed along
  for (const t of api.tanks) {
    if (!t.alive) continue;
    const ahead = dir * (front - t.x);
    if (ahead < -t.half || ahead > t.half + p.speed) continue;
    const nx = Math.max(t.half, Math.min(W - t.half - 1, front - dir * t.half));
    t.x = nx;
    t.y = groundUnder(api, nx, t.half);
  }

  // 5. the breaking lip: the top of the face is flung forward and lands just ahead
  let peakY = g.height;
  for (let i = 0; i < Math.min(L, 4) && !crash; i++) {
    const x = front - dir * i;
    const y = g.surfaceY(x);
    if (y < peakY) peakY = y;
  }
  let curl = 0;
  if (!crash) {
    // the curl: cells off the back slope are hung out over the face from the peak, drooping
    // forward. They fall away by the next tick and the crest picks them up again as it arrives.
    const pk = Math.max(1, Math.trunc(L / 6));
    let top = 0;
    for (let i = 0; i < L; i++) top = Math.max(top, profile[i]!);
    const reachOut = pk + Math.trunc(top / 5);
    const px = front - dir * pk;
    const py = g.surfaceY(px);
    let src = L - 1;
    for (let j = 1; j <= Math.min(reachOut, MAX_CURL - 4) && top >= 10 && py < g.height; j++) {
      const x = px + dir * j;
      if (x < 0 || x >= W) break;
      const y0 = py + Math.trunc((j * j) / reachOut);
      for (let y = y0; y < y0 + 2; y++) {
        if (y >= g.surfaceY(x) - 1) continue;
        // find a loose top cell on the back slope to hang here
        let from = -1;
        while (src > pk && from < 0) {
          const sx = front - dir * src;
          const sy = sx >= 0 && sx < W ? g.surfaceY(sx) : g.height;
          if (sy < g.height && loose(api, sy * W + sx)) from = sy * W + sx;
          else src--;
        }
        if (from < 0) break;
        const to = y * W + x;
        g.material[to] = g.material[from]!;
        g.coating[to] = g.coating[from]!;
        g.cellState[to] = 0;
        g.fallVel[to] = 0;
        g.clearCell(from);
        curl++;
        src--;
      }
    }
    for (let n = 0; n < Math.round(p.spray * scale) && load > 0; n++) {
      const i = api.rng.int(Math.min(L, 4));
      const x = front - dir * i;
      if (x < 0 || x >= W) continue;
      const idx = g.surfaceY(x) * W + x;
      if (idx >= g.size || !loose(api, idx)) continue;
      const vx = dir * (p.speed * FP + (api.rng.int(256) << 8));
      if (api.launch(idx, vx, -(FP / 2 + (api.rng.int(256) << 9)))) load--;
    }
    if ((api.tick & 3) === 0)
      api.emit('tsunami', front, peakY, peak, { dir, len: L, back: back ? 1 : 0 });
  }

  // 6. crash: the crest tips forward and comes down ahead as a heap
  if (crash) {
    for (let i = 0; i < L; i++) {
      const x = front - dir * i;
      if (x < 0 || x >= W) continue;
      const e = profile[i]!;
      const base = g.surfaceY(x) + e;
      for (let y = base - e; y < base && y < g.height; y++) {
        const h = base - y;
        const idx = y * W + x;
        if (!loose(api, idx)) continue;
        const vx = Math.trunc(dir * FP * (0.6 + (p.crash * h) / Math.max(1, peak)));
        api.launch(idx, vx + dir * (api.rng.int(256) << 7), -Math.trunc((FP * (8 + h * 2)) / 16));
      }
    }
    api.emit(
      'tsunamiCrash',
      front,
      peakY < g.height ? peakY : g.surfaceY(front),
      Math.max(8, peak),
      {
        dir,
        load,
      },
    );
    load = 0;
  }

  d[o + FRONT] = front;
  d[o + LOAD] = load;
  d[o + DIST] = dist;
  d[o + DONE] = crash ? 1 : 0;
  d[o + LIP] = crash ? 0 : curl;
}

/**
 * Dirt Tsunami: the ground at the impact heaves up into a wave that rolls away from the shooter,
 * with a smaller backwash the other way. Each tick the crest's real cells are lifted, the front
 * moves on scooping the ground it passes (so the wave grows and leaves a scoured trough), and
 * the crest is set down again further along. Its lip breaks forward as debris; tanks the front
 * reaches are lifted onto the crest and shoved along until the wave crashes and buries them.
 * Rock and props hold, and a wall taller than the crest breaks it early.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.dirt-tsunami',
  version: 1,
  params,
  start(api, p, c) {
    const owner = api.tanks[c.owner];
    const dir = owner && owner.x > c.x ? -1 : 1;
    // the backwash only exists when it has somewhere to go
    const data = [c.x, 0, 0, 0, 0, c.x, 0, 0, p.back > 0 ? 0 : 1, 0, dir, c.radius];
    api.emit('tsunamiRise', c.x, c.y, 24, { dir });
    return data;
  },
  step(api, p, inst) {
    const d = inst.data;
    const dir = d[DIR]!;
    if (d[DONE] === 0) stepWave(api, p, d, 0, dir, false);
    if (d[SLOTS + DONE] === 0) stepWave(api, p, d, SLOTS, -dir, true);
    return d[DONE] === 0 || d[SLOTS + DONE] === 0;
  },
});
