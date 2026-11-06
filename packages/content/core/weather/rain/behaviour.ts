import { z } from '@mudders/shared';
import { defineWeather } from '@mudders/sim';
import { Touched, tankColumns } from '../../../src/weather';

const params = z.strictObject({
  /** How far (columns) each way the rain looks for the rims that hold a puddle. */
  reach: z.number().int().min(2).max(200),
  /** Chance per turn, in thousandths, that the top dirt of a flooded hollow soaks into mud. */
  soak: z.number().int().min(0).max(1000),
  /** Chance per turn, in thousandths, that dirt right under that mud soaks too. */
  seep: z.number().int().min(0).max(1000),
  /** Deepest the mud gets under a hollow. */
  mudDepth: z.number().int().min(1).max(32),
  /** Chance per turn, in thousandths, that a flooded column gets a fresh cell of rain water. */
  puddle: z.number().int().min(0).max(1000),
  /** No more rain water once the map holds this much per 100 columns. */
  maxWater: z.number().int().min(0).max(2000),
  /** Ticks between rain patter events (ambience). */
  patter: z.number().int().min(10).max(600),
});

/**
 * Rain (§3.4): drag comes from the manifest. At each turn the rain runs off the hills into the
 * hollows and craters: a column whose ground lies below the lower of the highest ground within
 * `reach` on either side is flooded. Flooded columns get rain water (which pools, then soaks away)
 * and their dirt turns to mud, a cell deeper every few turns. Hills and slopes stay grassy.
 */
export default defineWeather<z.infer<typeof params>>({
  kind: 'weather',
  id: 'weather.rain',
  version: 1,
  params,
  onTurnStart(api, p) {
    const g = api.grid;
    const W = g.width;
    const H = g.height;
    const m = g.material;
    const dirt = api.mats.cellOf('material.dirt');
    const mud = api.mats.cellOf('material.mud');
    const water = api.mats.cellOf('material.water');
    const tanks = tankColumns(api);
    const touched = new Touched();

    // once per turn, not a hot path
    const surf = new Int32Array(W);
    for (let x = 0; x < W; x++) surf[x] = g.surfaceY(x);

    let wet = 0;
    for (let i = 0; i < m.length; i++) if (m[i] === water) wet++;
    const cap = Math.trunc((p.maxWater * W) / 100);

    for (let x = 0; x < W; x++) {
      const top = surf[x]!;
      if (top >= H || top <= 0) continue;
      // highest ground (smallest row) within reach on each side: the puddle's rims
      let left = H;
      let right = H;
      for (let d = 1; d <= p.reach; d++) {
        if (x - d >= 0) left = Math.min(left, surf[x - d]!);
        if (x + d < W) right = Math.min(right, surf[x + d]!);
      }
      const level = Math.max(left, right);
      if (top <= level) continue; // not below both rims: the rain runs off
      // soak: walk down through the mud already there, the first dirt below may turn
      for (let y = top, d = 0; y < H && d < p.mudDepth; y++, d++) {
        const i = y * W + x;
        if (m[i] === mud || m[i] === water) continue;
        if (m[i] === dirt && g.group[i] === 0 && api.rng.chance(d === 0 ? p.soak : p.seep, 1000)) {
          m[i] = mud;
          touched.add(x, y);
        }
        break;
      }
      if (!tanks[x] && wet < cap && api.rng.chance(p.puddle, 1000) && m[(top - 1) * W + x] === 0) {
        m[(top - 1) * W + x] = water;
        touched.add(x, top - 1);
        wet++;
      }
    }
    touched.flush(api);
  },
  onTick(api, p) {
    if (api.tick % p.patter === 0) api.emit('rainPatter', api.grid.width >> 1, 0, 0);
  },
});
