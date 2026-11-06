import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed } from '@mudders/sim';
import { ballisticStep, placeAt, solidAt, stickyAt } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
  /** Bounces before the next contact sets it off. */
  bounces: z.number().int().min(0).max(12),
  /** Share of the speed into the surface it keeps on the rebound. */
  restitution: z.number().min(0).max(1.5),
  /** Share of the speed along the surface it keeps. */
  friction: z.number().min(0).max(1.5),
  /** Slower than this (cells/tick) after a bounce and it goes off where it is. */
  minSpeed: z.number().min(0).max(10),
  /** Half-size of the window of cells sampled for the surface normal. */
  probe: z.number().int().min(1).max(6),
});
type Params = z.infer<typeof params>;

// data: [bounces so far]

/**
 * Ricochet (§5.1): a ballistic arc that rebounds off the ground like a ball on a billiard
 * cushion. On each terrain contact it reflects its velocity about the local surface normal
 * (estimated from the solid cells around the hit), keeping `restitution` of the speed into the
 * surface and `friction` of the speed along it, and asks the kernel to run the weapon's `pulse`
 * impacts at the hit cell (sparks, a scorch). A tank, the last bounce or running out of speed
 * sets it off. All integer maths plus `Math.sqrt` (§6.3).
 */
export default defineFlight<Params>({
  kind: 'flight',
  id: 'flight.ricochet',
  version: 2,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    ballisticStep(api, proj, p.gravityScale, p.windScale);
    return undefined;
  },
  contact(api, proj, p, hit) {
    if (hit.tank >= 0) return 'impact';
    // tar doesn't bounce: the ball sticks and goes off
    if (stickyAt(api, hit.x, hit.y)) return 'impact';
    const done = proj.data[0] ?? 0;
    if (done >= p.bounces) return 'impact';

    // Surface normal: away from the solid cells in a (2r+1)² window around the hit.
    const r = p.probe;
    let sx = 0;
    let sy = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (solidAt(api, hit.x + dx, hit.y + dy)) {
          sx -= dx;
          sy -= dy;
        }
      }
    }
    // Buried or perfectly symmetric: straight back the way it came.
    if (sx === 0 && sy === 0) {
      sx = -proj.vx;
      sy = -proj.vy;
    }
    const len = Math.sqrt(sx * sx + sy * sy);
    if (len < 1) return 'impact';
    const nx = Math.trunc((sx * FP) / len);
    const ny = Math.trunc((sy * FP) / len);

    // v' = friction·(v − vn·n) − restitution·vn·n, with vn the (negative) speed into the surface.
    let vn = Math.trunc((proj.vx * nx + proj.vy * ny) / FP);
    if (vn > 0) vn = -vn; // grazing a corner it is already leaving: still kick it off
    const tx = proj.vx - Math.trunc((vn * nx) / FP);
    const ty = proj.vy - Math.trunc((vn * ny) / FP);
    const fr = toFixed(p.friction);
    const re = toFixed(p.restitution);
    const vx = Math.trunc((tx * fr) / FP) - Math.trunc((Math.trunc((vn * re) / FP) * nx) / FP);
    const vy = Math.trunc((ty * fr) / FP) - Math.trunc((Math.trunc((vn * re) / FP) * ny) / FP);

    const min = toFixed(p.minSpeed);
    if (vx * vx + vy * vy < min * min) return 'impact';

    placeAt(proj, hit.freeX, hit.freeY);
    proj.vx = vx;
    proj.vy = vy;
    proj.data[0] = done + 1;
    return 'pulse';
  },
});
