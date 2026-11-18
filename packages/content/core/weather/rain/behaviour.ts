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

    const surf = new Int32Array(W);
    g.surfaces(surf);

    // the count only matters up to the cap; `indexOf` scans at native speed (this runs once a
    // turn, so a plain loop over the whole map would run unoptimised and cost a frame or two)
    const cap = Math.trunc((p.maxWater * W) / 100);
    let wet = 0;
    // (and starts at the highest ground: everything above it is air)
    let sky = H;
    for (let x = 0; x < W; x++) if (surf[x]! < sky) sky = surf[x]!;
    for (let i = m.indexOf(water, sky * W); i !== -1 && wet < cap; i = m.indexOf(water, i + 1))
      wet++;

    // The lowest row in every window of `reach` columns, in one pass each way: `fore[j]` is the
    // minimum from the start of j's block up to j, `back[j]` from j to the end of its block, so a
    // window starting at s is min(back[s], fore[s + reach - 1]). Columns off the map count as H.
    const k = p.reach;
    const n = W + 2 * k;
    const fore = new Int32Array(n);
    const back = new Int32Array(n);
    for (let j = 0; j < n; j++) {
      const v = j >= k && j < k + W ? surf[j - k]! : H;
      fore[j] = j % k === 0 ? v : Math.min(fore[j - 1]!, v);
    }
    for (let j = n - 1; j >= 0; j--) {
      const v = j >= k && j < k + W ? surf[j - k]! : H;
      back[j] = j % k === k - 1 || j === n - 1 ? v : Math.min(back[j + 1]!, v);
    }

    for (let x = 0; x < W; x++) {
      const top = surf[x]!;
      if (top >= H || top <= 0) continue;
      // highest ground (smallest row) within reach on each side: the puddle's rims
      const left = Math.min(back[x]!, fore[x + k - 1]!);
      const right = Math.min(back[x + k + 1]!, fore[x + 2 * k]!);
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
