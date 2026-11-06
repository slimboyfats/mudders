import { z } from '@mudders/shared';
import { defineFlight } from '@mudders/sim';
import { ballisticStep } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
});
type Params = z.infer<typeof params>;

/** Semi-implicit Euler under gravity, wind and weather drag, fixed-point (§3.4). */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.ballistic',
  version: 2,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    ballisticStep(api, proj, p.gravityScale, p.windScale);
  },
});
