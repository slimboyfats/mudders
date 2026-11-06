import type { SimApi } from '@mudders/sim';

/**
 * Generator helpers for buried and growing minerals (gen.caves, gen.marsh): gas pockets hidden in
 * the ground and crystal clusters. Integer maths and the match RNG only.
 */

/**
 * Bury `count` gas pockets (`material.gas-pocket`) as flat blobs under the ground surface
 * `surface[x]`. A pocket only replaces soft ground (`soft` cells), and every pocket cell keeps a
 * solid cell on all four sides, so nothing bursts at round start: something has to dig it out.
 */
export function buryGasPockets(
  api: SimApi,
  surface: Int32Array,
  count: number,
  soft: readonly number[],
): void {
  const { grid, rng, mats } = api;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const gas = mats.cellOf('material.gas-pocket');
  const isSoft = new Uint8Array(256);
  for (const c of soft) isSoft[c] = 1;
  for (let n = 0; n < count; n++) {
    const cx = rng.range(12, W - 13);
    const rx = rng.range(5, 11);
    const ry = rng.range(3, 6);
    const cy = surface[cx]! + ry + rng.range(6, 26);
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const dx = x - cx;
        const dy = y - cy;
        // an ellipse with a slightly lumpy edge
        if (dx * dx * ry * ry + dy * dy * rx * rx > rx * rx * ry * ry) continue;
        const i = y * W + x;
        if (isSoft[mat[i]!] === 0) continue;
        if (mat[i - 1] === 0 || mat[i + 1] === 0 || mat[i - W] === 0 || mat[i + W] === 0) continue;
        mat[i] = gas;
      }
    }
  }
}

/** Spike directions (dx, dy per 8 steps) for a cluster growing up; mirrored for hanging ones. */
const SPIKES: readonly (readonly [number, number])[] = [
  [0, -8],
  [3, -8],
  [-3, -8],
  [5, -6],
  [-5, -6],
  [1, -8],
  [-2, -8],
  [6, -5],
  [-6, -5],
];

/**
 * Grow a crystal cluster (`material.crystal`) from the ground cell (ax, ay): `spikes` tapering
 * shards fanning out of it, up (`dir` -1) from a floor or down (`dir` 1) from a roof, each up to
 * `len` cells long and never reaching below row `limit` (keeps headroom for shells and tanks).
 * Spikes only fill open air, plus a small root in the ground so the cluster sits in it.
 */
export function growCrystals(
  api: SimApi,
  ax: number,
  ay: number,
  dir: 1 | -1,
  spikes: number,
  len: number,
  limit: number,
): void {
  const { grid, rng, mats } = api;
  const W = grid.width;
  const H = grid.height;
  const mat = grid.material;
  const crystal = mats.cellOf('material.crystal');
  const put = (x: number, y: number, air: boolean): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (dir > 0 && y > limit) return;
    if (dir < 0 && y < limit) return;
    const i = y * W + x;
    if (air && mat[i] !== 0) return;
    mat[i] = crystal;
  };
  // the root: a little lens of crystal set into the ground
  for (let dy = 0; dy <= 2; dy++) {
    for (let dx = -7 + dy * 2; dx <= 7 - dy * 2; dx++) put(ax + dx, ay - dir * dy, false);
  }
  const first = rng.int(SPIKES.length);
  for (let s = 0; s < spikes; s++) {
    // the first spike is the tallest and closest to straight; the others fan out from it
    const d = SPIKES[s === 0 ? rng.int(2) * 5 : (first + s * 4) % SPIKES.length]!;
    const L = s === 0 ? len : rng.range(Math.max(4, len >> 2), Math.max(5, (len * 3) >> 2));
    const w0 = s === 0 ? rng.range(4, 5) : rng.range(2, 3);
    const ox = s === 0 ? 0 : rng.range(-4, 4);
    for (let t = 0; t <= L; t++) {
      const x = ax + ox + Math.trunc((d[0] * t) / 8);
      const y = ay + dir * (Math.trunc((-d[1] * t) / 8) + 1);
      const w = Math.trunc((w0 * (L - t) + L - 1) / L);
      for (let k = -w; k <= w; k++) put(x + k, y, true);
    }
  }
}
