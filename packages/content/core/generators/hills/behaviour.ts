import { z } from '@mudders/shared';
import { defineGenerator, type Prng } from '@mudders/sim';

const params = z.strictObject({
  /** Mean surface level as a fraction of map height from the top. */
  baseLevel: z.number().min(0.1).max(0.9),
  /** Peak-to-mean amplitude of the first octave, fraction of map height. */
  amplitude: z.number().min(0).max(0.5),
  octaves: z.number().int().min(1).max(8),
  /** Amplitude multiplier per octave. */
  roughness: z.number().min(0).max(1),
  /** Fraction of the surface covered by sand drifts. */
  sandChance: z.number().min(0).max(1),
  sandDepth: z.number().int().min(0).max(64),
  /** Depth of the bedrock band below the surface, fraction of map height. */
  rockDepth: z.number().min(0.02).max(1),
  rockPockets: z.number().int().min(0).max(64),
  /** Fraction of the width kept free of tanks at each edge. */
  spawnMargin: z.number().min(0).max(0.4),
  /**
   * Mud in the low ground (gen.marsh): columns whose surface lies more than `mudLevel` (fraction
   * of map height) below the map's mean surface get a mud layer that thickens with depth, up to
   * `mudDepth` cells.
   */
  mudDepth: z.number().int().min(0).max(64).default(0),
  mudLevel: z.number().min(-0.2).max(0.3).default(0),
});
type Params = z.infer<typeof params>;

/** Sum of value-noise octaves, in 1/256 cells. Integer smoothstep, no trig (§6.3). */
export function noise1d(
  rng: Prng,
  width: number,
  amp: number,
  octaves: number,
  roughness: number,
  base: number,
): Int32Array {
  const out = new Int32Array(width);
  let a = amp;
  for (let o = 0; o < octaves; o++) {
    const seg = Math.max(4, Math.floor(width / (base << o)));
    const n = Math.floor(width / seg) + 2;
    const pts = new Int32Array(n);
    for (let i = 0; i < n; i++) pts[i] = a > 0 ? rng.range(-a, a) : 0;
    for (let x = 0; x < width; x++) {
      const i = Math.floor(x / seg);
      const t = Math.floor(((x - i * seg) * 256) / seg);
      const s = Math.floor((t * t * (768 - 2 * t)) / 65536);
      const p0 = pts[i]!;
      out[x] = out[x]! + p0 + Math.trunc(((pts[i + 1]! - p0) * s) / 256);
    }
    a = Math.round(a * roughness);
  }
  return out;
}

export default defineGenerator<Params>({
  kind: 'gen',
  id: 'gen.hills',
  version: 1,
  params,
  generate(api, p, players) {
    const { grid, rng, mats } = api;
    const W = grid.width;
    const H = grid.height;
    const dirt = mats.cellOf('material.dirt');
    const sand = mats.cellOf('material.sand');
    const rock = mats.cellOf('material.rock');

    const amp = Math.round(p.amplitude * H * 256);
    const n = noise1d(rng, W, amp, p.octaves, p.roughness, 3);
    const surface = new Int32Array(W);
    const top = Math.floor(H * 0.12);
    const floor = H - 12;
    for (let x = 0; x < W; x++) {
      surface[x] = Math.max(
        top,
        Math.min(floor, Math.round(p.baseLevel * H) - Math.trunc(n[x]! / 256)),
      );
    }

    // Spawns: evenly spaced with jitter, then a flat pad under each.
    const spawns: number[] = [];
    const margin = Math.floor(W * p.spawnMargin) + 8;
    const span = W - 2 * margin;
    const spacing = players > 1 ? span / (players - 1) : 0;
    for (let i = 0; i < players; i++) {
      const j = Math.floor(spacing / 10);
      const jitter = players > 1 ? rng.range(-j, j) : 0;
      const x = players > 1 ? Math.round(margin + i * spacing) + jitter : Math.floor(W / 2);
      spawns.push(Math.max(margin, Math.min(W - margin, x)));
    }
    rng.shuffle(spawns);
    for (const sx of spawns) {
      const pad = surface[sx]!;
      for (let x = Math.max(0, sx - 10); x < Math.min(W, sx + 10); x++) surface[x] = pad;
    }

    // Bedrock band and sand drifts follow their own noise.
    const rockN = noise1d(rng, W, 20 * 256, 3, 0.5, 6);
    const sandN = noise1d(rng, W, 256 * 256, 2, 0.5, 4);
    const sandCut = Math.round((1 - 2 * p.sandChance) * 256 * 256);
    const mat = grid.material;
    const rockDepth = Math.round(p.rockDepth * H);
    for (let x = 0; x < W; x++) {
      const s = surface[x]!;
      const rockTop = Math.min(H, s + rockDepth + Math.trunc(rockN[x]! / 256));
      const sandBottom = sandN[x]! > sandCut ? s + p.sandDepth : s;
      for (let y = s; y < H; y++) {
        mat[y * W + x] = y >= rockTop ? rock : y < sandBottom ? sand : dirt;
      }
    }

    // Mud pools in the valleys: no rng, so maps without mud are unchanged.
    if (p.mudDepth > 0) {
      const mud = mats.cellOf('material.mud');
      let sum = 0;
      for (let x = 0; x < W; x++) sum += surface[x]!;
      const line = Math.floor(sum / W) + Math.round(p.mudLevel * H);
      for (let x = 0; x < W; x++) {
        const s = surface[x]!;
        if (s < line) continue;
        const bottom = Math.min(H, s + Math.min(p.mudDepth, 8 + (s - line)));
        for (let y = s; y < bottom; y++) if (mat[y * W + x] !== rock) mat[y * W + x] = mud;
      }
    }

    // Rock pockets: blobs buried in the dirt.
    for (let i = 0; i < p.rockPockets; i++) {
      const cx = rng.range(0, W - 1);
      const r = rng.range(5, 14);
      const cy = surface[cx]! + rng.range(r + 6, r + 6 + Math.max(1, rockDepth - r));
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r * r && mat[y * W + x] !== 0) mat[y * W + x] = rock;
        }
      }
    }
    return { spawns };
  },
});
