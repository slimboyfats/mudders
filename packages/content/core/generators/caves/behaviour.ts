import { z } from '@mudders/shared';
import { defineGenerator } from '@mudders/sim';
import { noise1d } from '../hills/behaviour';

const params = z.strictObject({
  /** Mean floor surface, fraction of map height from the top. */
  floorLevel: z.number().min(0.4).max(0.9),
  /** Peak-to-mean amplitude of the floor's hills, fraction of map height. */
  floorAmplitude: z.number().min(0).max(0.3),
  /** Mean underside of the roof, fraction of map height from the top. */
  roofLevel: z.number().min(0.05).max(0.5),
  roofAmplitude: z.number().min(0).max(0.2),
  /** Hanging stalactites per 1000 columns: [min, max]; longest as a fraction of the headroom. */
  stalactites: z.tuple([z.number().int().min(0).max(40), z.number().int().min(0).max(40)]),
  stalactiteLength: z.number().min(0).max(0.6),
  /** Stone pillars from floor to roof per 1000 columns: [min, max]. */
  pillars: z.tuple([z.number().int().min(0).max(8), z.number().int().min(0).max(8)]),
  /** Openings in the roof to the sky per 1000 columns: [min, max]. */
  skylights: z.tuple([z.number().int().min(0).max(6), z.number().int().min(0).max(6)]),
  /** Depth of the bedrock band below the floor, fraction of map height. */
  rockDepth: z.number().min(0.02).max(1),
  /** Fraction of the width kept free of tanks at each edge. */
  spawnMargin: z.number().min(0).max(0.4),
});
type Params = z.infer<typeof params>;

/**
 * An underground cavern (§4b): rolling dirt floor over bedrock, a static limestone roof hanging
 * with stalactites (glued by prop.cave-roof, so cut-off stone falls as dirt), a few stone pillars between the tanks and a skylight or two to the open air.
 * Shots have to fit under the roof, or be dug or blasted through it. Tanks spawn on the floor
 * (`spawnFrom` sits under the roof). Integer maths only.
 */
export default defineGenerator<Params>({
  kind: 'gen',
  id: 'gen.caves',
  version: 1,
  params,
  generate(api, p, players) {
    const { grid, rng, mats } = api;
    const W = grid.width;
    const H = grid.height;
    const mat = grid.material;
    const dirt = mats.cellOf('material.dirt');
    const rock = mats.cellOf('material.rock');
    const lime = mats.cellOf('material.limestone');

    // Floor: hills, as gen.hills draws them.
    const fN = noise1d(rng, W, Math.round(p.floorAmplitude * H * 256), 4, 0.5, 3);
    const floor = new Int32Array(W);
    const fBase = Math.round(p.floorLevel * H);
    for (let x = 0; x < W; x++) {
      floor[x] = Math.max(Math.round(H * 0.35), Math.min(H - 12, fBase - Math.trunc(fN[x]! / 256)));
    }

    // Spawns evenly spaced with jitter, flat pads.
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
      const pad = floor[sx]!;
      for (let x = Math.max(0, sx - 10); x < Math.min(W, sx + 10); x++) floor[x] = pad;
    }

    // Roof: its underside follows its own noise and never comes within 70 rows of a pad.
    const rN = noise1d(rng, W, Math.round(p.roofAmplitude * H * 256), 3, 0.5, 4);
    const roof = new Int32Array(W);
    const rBase = Math.round(p.roofLevel * H);
    const rough = noise1d(rng, W, 4 * 256, 2, 0.5, 40);
    for (let x = 0; x < W; x++) {
      roof[x] = Math.max(6, rBase + Math.trunc(rN[x]! / 256) + Math.trunc(rough[x]! / 256));
    }
    const clearOf = (x: number): number => {
      let lo = H;
      for (const sx of spawns) if (x > sx - 22 && x < sx + 22) lo = Math.min(lo, floor[sx]! - 70);
      return lo;
    };

    // Stalactites hang from the roof: narrow triangles, never over a spawn pad.
    const scale = W / 1000;
    const nSt = rng.range(
      Math.round(p.stalactites[0] * scale),
      Math.round(p.stalactites[1] * scale),
    );
    for (let i = 0; i < nSt; i++) {
      const cx = rng.range(4, W - 5);
      const half = rng.range(4, 12);
      const room = floor[cx]! - roof[cx]!;
      const most = Math.min(half * 5, Math.round(room * p.stalactiteLength));
      const len = rng.range(Math.min(half * 2, most), Math.max(half * 2, most));
      for (let x = Math.max(0, cx - half); x <= Math.min(W - 1, cx + half); x++) {
        const d = x < cx ? cx - x : x - cx;
        // convex flanks: a blunt cone rather than a needle
        const k = half - d;
        const tip = roof[cx]! + Math.trunc((len * (2 * k * half - k * k)) / (half * half));
        roof[x] = Math.max(roof[x]!, Math.min(tip, clearOf(x), floor[x]! - 24));
      }
    }
    for (let x = 0; x < W; x++) roof[x] = Math.min(roof[x]!, clearOf(x), floor[x]! - 24);

    // Skylights: gaps in the roof to the sky.
    const sky = new Uint8Array(W);
    const nSky = rng.range(Math.round(p.skylights[0] * scale), Math.round(p.skylights[1] * scale));
    for (let i = 0; i < nSky; i++) {
      const cx = rng.range(40, W - 41);
      const half = rng.range(10, 18);
      // a tank keeps its roof: no skylight straight over a spawn
      let near = false;
      for (const sx of spawns) if (sx > cx - half - 30 && sx < cx + half + 30) near = true;
      if (near) continue;
      for (let x = cx - half; x <= cx + half; x++) sky[x] = 1;
      // the shaft flares out where it meets the cave, so its walls aren't plumb
      for (let x = cx - half - 12; x <= cx + half + 12; x++) {
        const out = x < cx - half ? cx - half - x : x - cx - half;
        if (out > 0) roof[x] = Math.min(roof[x]!, Math.max(6, roof[x]! - (12 - out) * 3));
      }
    }

    const rockDepth = Math.round(p.rockDepth * H);
    const rkN = noise1d(rng, W, 16 * 256, 3, 0.5, 6);
    for (let x = 0; x < W; x++) {
      const s = floor[x]!;
      const rockTop = Math.min(H, s + rockDepth + Math.trunc(rkN[x]! / 256));
      for (let y = s; y < H; y++) mat[y * W + x] = y >= rockTop ? rock : dirt;
      if (sky[x] !== 0) continue;
      // a bedrock cap over the limestone, so the roof's top reads as deep rock
      const cap = Math.max(1, roof[x]! >> 2);
      for (let y = 0; y < roof[x]!; y++) mat[y * W + x] = y < cap ? rock : lime;
    }

    // Pillars: an hourglass of limestone from floor to roof, well clear of the tanks.
    const nPil = rng.range(Math.round(p.pillars[0] * scale), Math.round(p.pillars[1] * scale));
    for (let i = 0; i < nPil; i++) {
      for (let attempt = 0; attempt < 16; attempt++) {
        const cx = rng.range(30, W - 31);
        const half = rng.range(7, 12);
        let ok = sky[cx] === 0;
        for (const sx of spawns) if (sx > cx - half - 40 && sx < cx + half + 40) ok = false;
        if (!ok) continue;
        // start from the highest roof over the pillar's flared ends, so it meets the roof flush
        let top = roof[cx]!;
        for (let x = Math.max(0, cx - half - 4); x <= Math.min(W - 1, cx + half + 4); x++) {
          top = Math.min(top, roof[x]!);
        }
        const bot = floor[cx]!;
        const mid = (top + bot) >> 1;
        const reach = Math.max(1, (bot - top) >> 1);
        for (let y = top; y < bot; y++) {
          const d = y < mid ? mid - y : y - mid;
          const w = half - 3 + Math.trunc((d * d * 6) / (reach * reach));
          for (let x = Math.max(0, cx - w); x <= Math.min(W - 1, cx + w); x++) {
            if (mat[y * W + x] === 0) mat[y * W + x] = lime;
          }
        }
        break;
      }
    }

    const spawnFrom = new Int32Array(W);
    for (let x = 0; x < W; x++) spawnFrom[x] = sky[x] !== 0 ? 0 : roof[x]!;
    // the limestone holds only while joined to bedrock, the floor or the rest of the roof
    return {
      spawns,
      spawnFrom,
      glue: [{ prop: 'prop.cave-roof', material: 'material.limestone' }],
    };
  },
});
