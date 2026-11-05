import { FP, z } from '@mudders/shared';
import {
  NUM_DAMAGE_TYPES,
  SETTLE_STATIC,
  defineTerrainOp,
  floodCohesive,
  type OpCall,
  type SimApi,
} from '@mudders/sim';

const params = z.strictObject({
  /** Launch speed at the centre in cells/tick; falls off linearly to 0 at the radius. */
  speed: z.number().min(0.1).max(32),
  /** Upward kick as a fraction of the launch speed, so buried cells heave up and out. */
  lift: z.number().min(0).max(2),
  /** Cells slower than this stay put. */
  minSpeed: z.number().min(0),
  /** Ticks for the ring to reach the full radius. */
  expandTicks: z.number().int().min(1).max(120),
  /** Distance a cohesive blob is shoved at the centre, in cells. */
  blobPush: z.number().int().min(0).max(200),
  /** Largest cohesive body moved as one blob; bigger bodies hold. */
  maxBlob: z.number().int().min(16).max(1_000_000),
});
type Params = z.infer<typeof params>;

/** Strength floor so a near-zero resistance can't produce an unbounded push. */
const MIN_STRENGTH = 32;

/**
 * Shockwave displacement (§4a). A ring expands over `expandTicks`; each tick every loose (non-
 * static) cell in the new annulus is knocked loose as sim debris with an outward radial velocity
 * of `speed × (1 − d/R) / strength[damageType]` plus an upward `lift`. The whole band goes airborne
 * at once, flies a short arc and lands as terrain against the material just outside it, which the
 * next annulus then launches again: the dirt is bulldozed outward and piles up as a rim where the
 * speed runs out. Nothing is destroyed (debris that leaves the map sideways is the only loss).
 * Cohesive cells (material or coating cohesion > 0) are instead flood-filled and shoved as one blob
 * (§4b).
 */
function ring(api: SimApi, p: Params, c: OpCall, r0: number, r1: number): void {
  const { grid, mats, scratch } = api;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const coat = grid.coating;
  const kind = mats.settle;
  const str = mats.strength;
  const coh = mats.cohesion;
  const moved = scratch.moved;
  const gen = scratch.nextMovedGen();
  const R = c.radius;
  const cx = c.x;
  const cy = c.y;
  const r0s = r0 * r0;
  const r1s = r1 * r1;
  const dt = c.damageTypeIndex;
  const speedFp = p.speed * FP;
  const minFp = p.minSpeed * FP;

  for (let y = Math.max(0, cy - r1); y <= Math.min(H - 1, cy + r1); y++) {
    const dy = y - cy;
    for (let hh = 0; hh < 2; hh++) {
      const xs = hh === 0 ? 1 : -1;
      for (let x = hh === 0 ? cx - r1 : cx + r1; hh === 0 ? x < cx : x >= cx; x += xs) {
        if (x < 0 || x >= W) continue;
        const dx = x - cx;
        const d2 = dx * dx + dy * dy;
        if (d2 < r0s || d2 >= r1s) continue;
        const idx = y * W + x;
        const m = mat[idx]!;
        // static cells hold, unless they belong to a prop group: those take the hit (§4c)
        const inGroup = grid.group[idx] !== 0;
        if (m === 0 || moved[idx] === gen || (kind[m] === SETTLE_STATIC && !inGroup)) continue;
        const dist = Math.max(1, Math.sqrt(d2));
        const s = Math.max(MIN_STRENGTH, str[m * NUM_DAMAGE_TYPES + dt]!);
        const v = (speedFp * (R - dist) * 256) / (R * s);
        if (v < minFp) continue;
        if (!inGroup && (coh[m]! > 0 || coh[coat[idx]!]! > 0)) {
          const push = Math.trunc((p.blobPush * (R - dist) * 256) / (R * s));
          if (push > 0) moveBlob(api, p, idx, cx, cy, R, push, gen);
          continue;
        }
        const ux = d2 === 0 ? 0 : dx / dist;
        const uy = d2 === 0 ? -1 : dy / dist;
        api.launch(idx, Math.trunc(ux * v), Math.trunc((uy - p.lift) * v));
      }
    }
  }
  grid.markDirty(cx - r1, cy - r1, cx + r1, cy + r1);
}

function moveBlob(
  api: SimApi,
  p: Params,
  start: number,
  cx: number,
  cy: number,
  R: number,
  push: number,
  gen: number,
): void {
  const { grid, mats, scratch } = api;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const coat = grid.coating;
  const state = grid.cellState;
  const q = scratch.queue;
  const mark = scratch.mark;
  const moved = scratch.moved;
  const fg = scratch.nextMarkGen();
  const n = floodCohesive(grid, mats, scratch, start, cx, cy, R, fg, p.maxBlob);
  if (n < 0) {
    moved[start] = gen;
    return;
  }
  let sx = 0;
  let sy = 0;
  let minX = W;
  let maxX = 0;
  let minY = H;
  let maxY = 0;
  for (let i = 0; i < n; i++) {
    const j = q[i]!;
    const x = j % W;
    const y = (j - x) / W;
    sx += x;
    sy += y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const dx = sx / n - cx;
  let dy = sy / n - cy;
  if (dx === 0 && dy === 0) dy = -1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  let bx = Math.round((dx * push) / dist);
  let by = Math.round((dy * push) / dist);

  while (bx !== 0 || by !== 0) {
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const j = q[i]!;
      const x = (j % W) + bx;
      const y = Math.floor(j / W) + by;
      if (x < 0 || y < 0 || x >= W || y >= H) ok = false;
      else {
        const t = y * W + x;
        if (mat[t] !== 0 && mark[t] !== fg) ok = false;
      }
    }
    if (ok) break;
    bx = Math.trunc(bx / 2);
    by = Math.trunc(by / 2);
  }
  if (bx === 0 && by === 0) {
    for (let i = 0; i < n; i++) moved[q[i]!] = gen;
    return;
  }
  const off = by * W + bx;
  const tm = scratch.tmpMat;
  const tc = scratch.tmpCoat;
  const ts = scratch.tmpState;
  for (let i = 0; i < n; i++) {
    const j = q[i]!;
    tm[i] = mat[j]!;
    tc[i] = coat[j]!;
    ts[i] = state[j]!;
    mat[j] = 0;
    coat[j] = 0;
    state[j] = 0;
    grid.fallVel[j] = 0;
  }
  for (let i = 0; i < n; i++) {
    const t = q[i]! + off;
    mat[t] = tm[i]!;
    coat[t] = tc[i]!;
    state[t] = ts[i]!;
    moved[t] = gen;
  }
  grid.markDirty(
    Math.min(minX, minX + bx),
    Math.min(minY, minY + by),
    Math.max(maxX, maxX + bx),
    Math.max(maxY, maxY + by),
  );
}

function ringEdge(R: number, k: number, ticks: number): number {
  return Math.min(R, Math.floor((R * (k + 1) + ticks - 1) / ticks));
}

export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.displace',
  version: 2,
  params,
  start(api, p, c) {
    const r1 = ringEdge(c.radius, 0, p.expandTicks);
    ring(api, p, c, 0, r1);
    api.emit('shockwave', c.x, c.y, c.radius, { ticks: p.expandTicks });
    return r1 < c.radius ? [r1] : null;
  },
  step(api, p, inst) {
    const r0 = inst.data[0]!;
    const r1 = ringEdge(inst.call.radius, inst.t, p.expandTicks);
    ring(api, p, inst.call, r0, r1);
    inst.data[0] = r1;
    return r1 < inst.call.radius;
  },
});
