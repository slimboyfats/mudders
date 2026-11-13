import { ContentIdSchema, z } from '@mudders/shared';
import { defineTerrainOp } from '@mudders/sim';

const params = z.strictObject({
  /** What floods in. */
  water: ContentIdSchema.refine((id) => id.startsWith('material.'), 'must be a material.* id'),
  /** Turns into the round before the water starts to climb. */
  first: z.number().int().min(0).max(40),
  /** Rows the water climbs at the start of each turn. */
  rise: z.number().int().min(1).max(40),
  /** Rows above the lowest ground on the map the flood starts at. */
  start: z.number().int().min(0).max(100),
  /** Health a tank with its top under the surface loses each turn. */
  damage: z.number().int().min(0).max(100),
});
type Params = z.infer<typeof params>;

const LAST = 0;
/** The flood's surface row (cells at or below it fill). */
const LEVEL = 1;

/**
 * Rising Water (round twist). The flood starts a little above the lowest ground on the map and
 * climbs `rise` rows at the start of every turn from `first` on: every open column from the
 * surface row down to the first solid cell fills with water, so valleys, craters and tunnels open
 * to the sky become lakes. A tank whose top is under the surface takes `damage` each turn.
 */
export default defineTerrainOp<Params>({
  kind: 'terrainop',
  id: 'terrainop.rising-water',
  version: 1,
  params,
  start(api, p) {
    const g = api.grid;
    let low = 0;
    for (let x = 0; x < g.width; x++) {
      const y = g.surfaceY(x);
      if (y < g.height && y > low) low = y;
    }
    return [api.turn, Math.max(0, low - p.start)];
  },
  step(api, p, inst) {
    const d = inst.data;
    if (api.turn === d[LAST]) return 'idle';
    d[LAST] = api.turn;
    if (api.turn < p.first) return 'idle';
    const g = api.grid;
    const W = g.width;
    const m = g.material;
    const water = api.mats.cellOf(p.water);
    const level = Math.max(0, d[LEVEL]! - p.rise);
    d[LEVEL] = level;
    let maxY = -1;
    for (let x = 0; x < W; x++) {
      for (let y = level, i = level * W + x; y < g.height; y++, i += W) {
        const c = m[i]!;
        if (c === water) continue;
        if (c !== 0) break;
        m[i] = water;
        if (y > maxY) maxY = y;
      }
    }
    if (maxY >= 0) g.markDirty(0, level, W - 1, maxY);
    for (const t of api.tanks) {
      if (t.alive && t.y - t.h > level && p.damage > 0) api.hurt(t.player, p.damage, -1);
    }
    api.emit('floodRise', W >> 1, level, 0, { level });
    return 'idle';
  },
});
