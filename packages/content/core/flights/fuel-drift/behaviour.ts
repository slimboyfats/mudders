import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed } from '@mudders/sim';
import { placeAt } from '../../../src/flight';

const params = z.strictObject({
  /** Share of its speed the puff keeps each tick (air drag): it billows out fast, then hangs. */
  drag: z.number().min(0.5).max(1),
  /** Gravity scale: fuel vapour is a little heavier than air and slowly settles. */
  gravityScale: z.number().min(0).max(1),
  windScale: z.number().min(0).max(10),
  /** Share of its speed along the ground it keeps when it brushes the ground. */
  slide: z.number().min(0).max(1),
  maxTicks: z.number().int().min(1),
});
type Params = z.infer<typeof params>;

/**
 * Fuel drift (Fuel-Air Bomb): a puff of fuel vapour. It billows out from where it was spawned,
 * slows under heavy air drag, sinks a little, drifts with the wind, and never enters the ground:
 * on touching it, it settles on the last free cell and keeps sliding along it, so the cloud
 * hugs the terrain and pours into dips. Tanks don't stop it (the weapon has no `onTank`). It goes
 * off on its weapon's timer. Fixed-point integer maths only (§6.3).
 */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.fuel-drift',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    const keep = toFixed(p.drag);
    proj.vx = Math.trunc((proj.vx * keep) / FP);
    proj.vy = Math.trunc((proj.vy * keep) / FP);
    proj.vx += Math.trunc((api.wind * toFixed(p.windScale)) / FP);
    proj.vy += Math.trunc((api.gravity * toFixed(p.gravityScale)) / FP);
    proj.x += proj.vx;
    proj.y += proj.vy;
    return undefined;
  },
  contact(_api, proj, p, hit) {
    placeAt(proj, hit.freeX, hit.freeY);
    const slide = toFixed(p.slide);
    // along the ground: keep the sideways share, lose the push into the ground
    if (hit.freeY < hit.y) {
      proj.vx = Math.trunc((proj.vx * slide) / FP);
      proj.vy = 0;
    } else {
      proj.vx = 0;
      proj.vy = Math.trunc((proj.vy * slide) / FP);
    }
    return 'continue';
  },
});
