import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed } from '@mudders/sim';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
});
type Params = z.infer<typeof params>;

/** Semi-implicit Euler under gravity and wind, fixed-point (§3.4). */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.ballistic',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    proj.vx += Math.trunc((api.wind * toFixed(p.windScale)) / FP);
    proj.vy += Math.trunc((api.gravity * toFixed(p.gravityScale)) / FP);
    proj.x += proj.vx;
    proj.y += proj.vy;
  },
});
