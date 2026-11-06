import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed } from '@mudders/sim';

const params = z.strictObject({
  /** Fall speed, cells/tick (the vertical part of the meteor's straight streak). */
  speed: z.number().min(1).max(16),
  /** Sideways cells per cell of fall: how steeply the meteors slant in. */
  slant: z.number().min(0).max(2),
  /** Landing offset from the impact point per cell/tick of the child's spawn `vx`, in cells. */
  reach: z.number().min(0).max(200),
  /** Most ticks a meteor waits above the map before it comes in (match PRNG per meteor). */
  maxDelay: z.number().int().min(0).max(300),
  /** Cells above the top of the map where a meteor starts its streak. */
  startAbove: z.number().int().min(0).max(200),
  maxTicks: z.number().int().min(1),
});
type Params = z.infer<typeof params>;

/**
 * Meteor (§5.1): a child shell spawned where its parent landed. On its first tick it picks a
 * landing column (the impact point offset by its spawn `vx` × `reach`) and a random delay, then
 * hides above the map. When the delay runs out it appears high in the sky behind the shooter
 * (meteors travel the way the shooter faced the impact) and streaks down in a straight slanted
 * line, no gravity or wind, onto that column. `data` = [landing column, tick it comes in].
 */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.meteor',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    const W = api.grid.width;
    if (proj.data.length === 0) {
      const reach = toFixed(p.reach);
      const off = Math.trunc((proj.vx * Math.trunc(reach / FP)) / FP);
      const tx = Math.max(2, Math.min(W - 3, Math.floor(proj.x / FP) + off));
      const delay = proj.age + 1 + (p.maxDelay > 0 ? api.rng.int(p.maxDelay + 1) : 0);
      proj.data = [tx, delay];
      proj.x = tx * FP + FP / 2;
      proj.y = -(p.startAbove + 8) * FP;
      proj.vx = 0;
      proj.vy = 0;
      return 'skip';
    }
    const tx = proj.data[0] ?? Math.floor(proj.x / FP);
    const delay = proj.data[1] ?? 1;
    if (proj.age < delay) return 'skip';
    if (proj.age === delay) {
      // come in from behind the shooter, the way the shot was travelling
      const owner = api.tanks[proj.owner];
      const dir = owner && owner.x > tx ? -1 : 1;
      const top = -p.startAbove;
      const ty = api.grid.surfaceY(tx);
      const vy = toFixed(p.speed);
      const fall = ty - top;
      let sx = tx - dir * Math.trunc((fall * toFixed(p.slant)) / FP);
      sx = Math.max(0, Math.min(W - 1, sx));
      const ticks = Math.max(1, Math.trunc((fall * FP) / vy));
      proj.vx = Math.trunc(((tx - sx) * FP) / ticks);
      proj.vy = vy;
      proj.x = sx * FP + FP / 2;
      proj.y = top * FP;
      api.emit('meteorEntry', sx, top, 0, {});
      return 'skip';
    }
    proj.x += proj.vx;
    proj.y += proj.vy;
    return undefined;
  },
});
