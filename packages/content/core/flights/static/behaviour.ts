import { z } from '@mudders/shared';
import { defineFlight } from '@mudders/sim';

const params = z.strictObject({ maxTicks: z.number().int().min(1) });

/** Hangs where it was spawned: a timed charge (Singularity's core). */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.static',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(_api, proj) {
    proj.vx = 0;
    proj.vy = 0;
  },
});
