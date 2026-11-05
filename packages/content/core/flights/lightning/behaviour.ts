import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed } from '@mudders/sim';

const params = z.strictObject({
  /** Fall speed of the bolt, cells/tick. */
  speed: z.number().min(1).max(32),
  maxTicks: z.number().int().min(1),
});

/**
 * Lightning (§5.1): on its first tick the shell jumps to the top of the map above the highest
 * enemy tank (ties: lower player number) and drops straight down, ignoring wind and gravity.
 * With no enemy alive it drops where it is.
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.lightning',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.age === 0) {
      let best = -1;
      let bestY = 0;
      for (const t of api.tanks) {
        if (!t.alive || t.player === proj.owner) continue;
        if (best < 0 || t.y < bestY) {
          best = t.player;
          bestY = t.y;
        }
      }
      const target = best >= 0 ? api.tanks[best]! : null;
      if (target) proj.x = target.x * FP + FP / 2;
      proj.y = 0;
      proj.vx = 0;
      proj.vy = toFixed(p.speed);
      return 'skip';
    }
    proj.y += proj.vy;
    return undefined;
  },
});
