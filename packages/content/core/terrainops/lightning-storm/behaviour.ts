import { ContentIdSchema, z } from '@mudders/shared';
import { FP, defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** The bolt's shell: it goes off where it is put, on the ground it strikes. */
  bolt: ContentIdSchema.refine((id) => id.startsWith('weapon.'), 'must be a weapon.* id'),
  /** Turns into the round before the first bolts come. */
  first: z.number().int().min(0).max(40),
  /** Bolts at the start of each turn (both ends inclusive); the first goes for the highest tank. */
  count: z.tuple([z.number().int().min(0).max(8), z.number().int().min(0).max(8)]),
  /** The other bolts strike one of this many tallest columns, picked at random. */
  tallest: z.number().int().min(1).max(400),
});
type Params = z.infer<typeof params>;

const LAST = 0;

/**
 * Lightning Storm (round twist). At the start of every turn from `first` on, `count` bolts crack
 * down out of the sky: the first onto the living tank standing highest, the rest onto the tallest
 * ground on the map. Each bolt is a real shell put on the spot it strikes, so it blasts and hurts
 * like any other (no one is credited); the `bolt` and `thunder` effects draw it.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.lightning-storm',
  version: 1,
  params,
  start(api) {
    return [api.turn];
  },
  step(api, p, inst) {
    const d = inst.data;
    if (api.turn === d[LAST]) return 'idle';
    d[LAST] = api.turn;
    if (api.turn < p.first) return 'idle';
    const w = api.weaponByIndex(p.bolt);
    if (w < 0) return 'idle';
    const g = api.grid;
    const W = g.width;
    // the tallest columns, highest first (ties: lower column first)
    const cols: number[] = [];
    for (let x = 4; x < W - 4; x += 2) if (g.surfaceY(x) < g.height) cols.push(x);
    cols.sort((a, b) => g.surfaceY(a) - g.surfaceY(b) || a - b);
    const n = api.rng.range(p.count[0], Math.max(p.count[0], p.count[1]));
    for (let k = 0; k < n; k++) {
      let x = -1;
      let y = 0;
      if (k === 0) {
        let best = g.height;
        for (const t of api.tanks) {
          if (t.alive && t.y - t.h < best) {
            best = t.y - t.h;
            x = t.x;
            y = Math.max(0, best - 1);
          }
        }
      }
      if (x < 0) {
        if (cols.length === 0) break;
        x = cols[api.rng.int(Math.min(p.tallest, cols.length))]!;
        y = Math.max(0, g.surfaceY(x) - 1);
      }
      api.emit('bolt', x, y, 0, { top: 0, storm: 1 });
      api.emit('thunder', x, 0, 24, {});
      api.throwShell(w, -1, x * FP + (FP >> 1), y * FP + (FP >> 1), 0, FP);
    }
    return 'idle';
  },
});
