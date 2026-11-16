import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** The skies a front can bring (`weather.*` ids; "clear" for clear skies). */
  skies: z
    .array(
      z.union([
        z.literal('clear'),
        ContentIdSchema.refine((id) => id.startsWith('weather.'), 'must be a weather.* id'),
      ]),
    )
    .min(2)
    .max(8),
  /** Turns into the round before the first front. */
  first: z.number().int().min(0).max(40),
  /** Turns between fronts, drawn from [min, max]. */
  every: z.tuple([z.number().int().min(1).max(20), z.number().int().min(1).max(20)]),
});
type Params = z.infer<typeof params>;

const LAST = 0;
/** Turn the next front comes in. */
const NEXT = 1;
/** Index in `skies` of the sky the last front brought, or -1 before the first. */
const SKY = 2;

/**
 * Weather fronts (map event / round twist). From turn `first` on, every `every` turns a front
 * moves in and the weather changes to another of `skies`: clear skies cloud over into rain,
 * rain turns to snow, a storm clears. The weather's own rules come with it (rain drags on shells
 * and puddles the hollows, snow chills the air), so the conditions shift under the players during
 * the round. Costs nothing between fronts.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.weather-fronts',
  version: 1,
  params,
  start(api, p) {
    return [api.turn, api.turn + p.first, -1];
  },
  step(api, p, inst) {
    const d = inst.data;
    if (api.turn === d[LAST]) return 'idle';
    d[LAST] = api.turn;
    if (api.turn < d[NEXT]!) return 'idle';
    const lo = Math.min(p.every[0], p.every[1]);
    const hi = Math.max(p.every[0], p.every[1]);
    d[NEXT] = api.turn + api.rng.range(lo, hi);
    // any sky but the one it is now
    let now = d[SKY]!;
    if (now < 0) now = p.skies.indexOf(api.sky ?? 'clear');
    let k = api.rng.int(now < 0 ? p.skies.length : p.skies.length - 1);
    if (now >= 0 && k >= now) k++;
    d[SKY] = k;
    const sky = p.skies[k]!;
    api.setSky(sky === 'clear' ? null : sky);
    api.emit('weatherFront', api.grid.width >> 1, 0, 0, { sky: k });
    return 'idle';
  },
});
