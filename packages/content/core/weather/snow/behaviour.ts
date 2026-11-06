import { z } from '@mudders/shared';
import { defineWeather } from '@mudders/sim';
import { Touched, tankColumns } from '../../../src/weather';

const params = z.strictObject({
  /** Chance per turn, in thousandths, that a snowy column gets one more cell on top (bare ground always gets one). */
  fall: z.number().int().min(0).max(1000),
  /** Snow stops piling on a column once it is this deep. */
  maxDepth: z.number().int().min(1).max(64),
  /** Ticks between gusts of snowstorm hush (ambience). */
  hush: z.number().int().min(10).max(900),
});

/**
 * Snow (§3.4): drag comes from the manifest; at each turn fresh snow settles on the surface of
 * random columns (not on tanks, not on water), piling up to `maxDepth`. Being loose, it slides off
 * steep slopes into the hollows.
 */
export default defineWeather<z.infer<typeof params>>({
  kind: 'weather',
  id: 'weather.snow',
  version: 1,
  params,
  onTurnStart(api, p) {
    const g = api.grid;
    const W = g.width;
    const H = g.height;
    const m = g.material;
    const snow = api.mats.cellOf('material.snow');
    const water = api.mats.cellOf('material.water');
    const tanks = tankColumns(api);
    const touched = new Touched();
    for (let x = 0; x < W; x++) {
      if (tanks[x]) continue;
      const top = g.surfaceY(x);
      // bare columns (sudden death's void) and the top row stay clear; water melts it
      if (top <= 0 || top >= H || m[top * W + x] === water) continue;
      // bare ground always gets a first cell, so the blanket is whole from the first turn;
      // after that it deepens unevenly
      if (m[top * W + x] === snow && !api.rng.chance(p.fall, 1000)) continue;
      let depth = 0;
      for (let y = top; y < H && depth < p.maxDepth && m[y * W + x] === snow; y++) depth++;
      if (depth >= p.maxDepth) continue;
      m[(top - 1) * W + x] = snow;
      touched.add(x, top - 1);
    }
    // powder slides off the column it lands on, which can leave one-cell pits between drifts: fill
    // any column whose surface lies two or more rows below both neighbours
    let left = g.surfaceY(0);
    let here = g.surfaceY(1);
    for (let x = 1; x < W - 1; x++) {
      const right = g.surfaceY(x + 1);
      if (!tanks[x] && here < H && here - 2 >= Math.max(left, right) && m[here * W + x] !== water) {
        m[(here - 1) * W + x] = snow;
        touched.add(x, here - 1);
        here--;
      }
      left = here;
      here = right;
    }
    touched.flush(api);
  },
  onTick(api, p) {
    if (api.tick % p.hush === 0) api.emit('snowHush', api.grid.width >> 1, 0, 0);
  },
});
