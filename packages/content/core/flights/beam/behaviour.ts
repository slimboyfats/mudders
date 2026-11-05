import { z } from '@mudders/shared';
import { defineFlight, toFixed } from '@mudders/sim';
import { ballisticStep, placeAt, withSpeed } from '../../../src/flight';

const params = z.strictObject({
  /** Cells per tick along the aim line; power only sets the direction. */
  speed: z.number().min(1).max(8),
  maxTicks: z.number().int().min(1),
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  /** Run the weapon's pulse impacts every N ticks in flight (a stream); 0 = only on contact. */
  pulseEvery: z.number().int().min(0).max(60),
  /** Cut on through terrain (pulse at each cell hit) instead of going off on it. */
  throughSolid: z.boolean(),
});

/**
 * Beam (§5.1 lasers, Water Cannon): leaves the barrel at a fixed speed along the aim, whatever the
 * power, and (for a laser) ignores gravity and wind. A cutting beam pulses where it meets terrain
 * and carries on, so it slices a thin channel; a tank stops it.
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.beam',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.data.length === 0) {
      const [vx, vy] = withSpeed(proj.vx, proj.vy, toFixed(p.speed));
      proj.vx = vx;
      proj.vy = vy;
      proj.data.push(1);
    }
    ballisticStep(api, proj, p.gravityScale, p.windScale);
    return p.pulseEvery > 0 && proj.age % p.pulseEvery === 0 ? 'pulse' : undefined;
  },
  contact(_api, proj, p, hit) {
    if (hit.tank >= 0 || !p.throughSolid) return 'impact';
    placeAt(proj, hit.x, hit.y);
    return 'pulse';
  },
});
