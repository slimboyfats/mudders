import { z } from '@mudders/shared';
import { KEEP, NUM_DAMAGE_TYPES, defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({});

/**
 * Remove cells in a disc. A cell at distance d survives if d × strength > radius, so rock
 * (blast 2) is carved at half the radius and strength 0 is always destroyed (§4.2, §4b).
 *
 * Compactable materials (mud, `compact` in the manifest) are pushed down rather than only blown
 * away: per column, the cells under the crater floor are packed into the material's `into` cell,
 * `ratio` packed cells per carved one, so the ground sinks in as a dent with a tougher floor.
 */
export default defineTerrainOp<z.infer<typeof params>>({
  kind: 'terrainop',
  id: 'terrainop.carve',
  version: 2,
  params,
  start(api, _p, c) {
    const { grid, mats } = api;
    const W = grid.width;
    const R = c.radius;
    const r2s = R * R * 65536;
    // Rims (ice, clay) can reach a few cells past the radius.
    const RR = R + mats.rimMaxDepth;
    const x0 = Math.max(0, c.x - RR);
    const x1 = Math.min(W - 1, c.x + RR);
    const y0 = Math.max(0, c.y - RR);
    const y1 = Math.min(grid.height - 1, c.y + RR);
    const dt = c.damageTypeIndex;
    const rInto = mats.rimInto;
    const rDepth = mats.rimDepth;
    const rChance = mats.rimChance;
    const R256 = R * 256;
    const mat = grid.material;
    const str = mats.strength;
    const nd = NUM_DAMAGE_TYPES;
    const cInto = mats.compactInto;
    const keep = KEEP; // a local, so the hot loop does no module-binding lookup
    const cRatio = mats.compactRatio;
    // Per column (x - x0): summed compaction ratio ×256, and the lowest carved row.
    const cols = x1 - x0 + 1;
    const q = api.scratch.queue;
    let compacted = false;
    for (let y = y0; y <= y1; y++) {
      const dy = y - c.y;
      for (let x = x0, i = y * W + x0; x <= x1; x++, i++) {
        const m = mat[i]!;
        if (m === 0) continue;
        const dx = x - c.x;
        const d2 = dx * dx + dy * dy;
        const s = str[m * nd + dt]!;
        if (d2 > R * R || (s !== 0 && d2 * s * s > r2s)) {
          // Not carved: maybe on the rim, within `depth` cells of where this material gave way.
          const ri = m * nd + dt;
          const into = rInto[ri]!;
          if (into === keep) continue;
          const e =
            s > 256 ? Math.floor((R256 * 256) / s) + rDepth[ri]! * 256 : R256 + rDepth[ri]! * 256;
          if (d2 * 65536 > e * e) continue;
          const ch = rChance[ri]!;
          if (
            ch < 256 &&
            Math.imul(x * 374761393 + y * 668265263 + c.x * 2246822519, 3266489917) >>> 24 >= ch
          )
            continue;
          mat[i] = into;
          grid.cellState[i] = 0;
          grid.fallVel[i] = 0;
          continue;
        }
        if (cInto[m] !== keep) {
          const k = x - x0;
          if (!compacted) {
            q.fill(0, 0, cols);
            q.fill(-1, cols, 2 * cols);
            compacted = true;
          }
          q[k] = q[k]! + cRatio[m]!;
          q[cols + k] = y; // rows ascend, so the last one is the lowest
        }
        mat[i] = 0;
        grid.coating[i] = 0;
        grid.cellState[i] = 0;
        grid.fallVel[i] = 0;
      }
    }
    let yMax = y1;
    if (compacted) {
      const H = grid.height;
      const cDepth = mats.compactDepth;
      for (let k = 0; k < cols; k++) {
        const floor = q[cols + k]!;
        if (floor < 0) continue;
        let left = Math.max(1, q[k]! >> 8);
        let depth = 0;
        for (let y = floor + 1, i = y * W + x0 + k; y < H && left > 0; y++, i += W) {
          const m = mat[i]!;
          if (m === 0) break; // packing never jumps a cave
          const into = cInto[m]!;
          if (into === keep || depth >= cDepth[m]!) break;
          mat[i] = into;
          grid.cellState[i] = 0;
          depth++;
          left--;
          if (y > yMax) yMax = y;
        }
      }
    }
    grid.markDirty(x0, y0, x1, yMax);
    return null;
  },
});
