import { z } from '@mudders/shared';
import { defineFlight } from '@mudders/sim';
import { ballisticStep, shellContact, shellContacted } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
});
type Params = z.infer<typeof params>;

/**
 * Semi-implicit Euler under gravity, wind and weather drag, fixed-point (§3.4). Version 3: with the
 * match rule `shells` on, the shell answers to the ground it hits (`shellContact`).
 */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.ballistic',
  version: 3,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    ballisticStep(api, proj, p.gravityScale, p.windScale);
  },
  // while the match rule `shells` is on: glance off hard ground, skip on water, bury in soft
  contact(api, proj, _p, hit) {
    return shellContact(api, proj, hit);
  },
  contacted(api, proj, _p, hit) {
    shellContacted(api, proj, hit);
  },
});
