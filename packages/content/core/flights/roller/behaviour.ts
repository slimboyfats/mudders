import { z } from '@mudders/shared';
import { defineFlight, toFixed } from '@mudders/sim';
import { ballisticStep, cellX, cellY, placeAt, solidAt } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
  /** Columns rolled per tick. */
  speed: z.number().int().min(1).max(4),
  /** Highest step it can climb from one column to the next. */
  maxClimb: z.number().int().min(0).max(4),
  /** How far it may climb above the lowest point it reached before it stops and goes off. */
  climbBudget: z.number().int().min(0).max(32),
  /** A drop deeper than this and it leaves the ground and flies again. */
  drop: z.number().int().min(1).max(16),
  /** Ticks of rolling before it goes off wherever it is. */
  maxRoll: z.number().int().min(1).max(600),
});

const FLY = 0;
const ROLL = 1;
// data: [mode, dir, rolled, lowestY]

/** How far the ground falls away below (x, y), up to `max`. */
function depth(api: Parameters<typeof solidAt>[0], x: number, y: number, max: number): number {
  let k = 0;
  while (k < max && !solidAt(api, x, y + k + 1)) k++;
  return k;
}

/**
 * Roller (§5.1): flies a normal arc; on landing it rolls downhill along the surface, over small
 * bumps, until it hits a tank, runs into a wall, or would have to climb out of a valley, and
 * goes off there.
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.roller',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.data[0] !== ROLL) {
      ballisticStep(api, proj, p.gravityScale, p.windScale);
      return undefined;
    }
    const dir = proj.data[1]!;
    for (let s = 0; s < p.speed; s++) {
      const x = cellX(proj);
      const y = cellY(proj);
      const nx = x + dir;
      if (nx < 0 || nx >= api.grid.width) {
        placeAt(proj, nx, y); // off the edge: the wall rule decides
        return undefined;
      }
      let ny: number;
      if (solidAt(api, nx, y)) {
        let k = 1;
        while (k <= p.maxClimb && solidAt(api, nx, y - k)) k++;
        if (k > p.maxClimb) return 'impact';
        ny = y - k;
      } else {
        const d = depth(api, nx, y, p.drop);
        if (d >= p.drop) {
          // rolled off a ledge: fly again, keeping the rolling speed
          proj.data[0] = FLY;
          placeAt(proj, nx, y);
          proj.vx = dir * toFixed(p.speed);
          proj.vy = 0;
          return undefined;
        }
        ny = y + d;
      }
      placeAt(proj, nx, ny);
      if (ny > proj.data[3]!) proj.data[3] = ny;
      if (ny < proj.data[3]! - p.climbBudget) return 'impact';
      proj.data[2] = proj.data[2]! + 1;
      if (proj.data[2] >= p.maxRoll) return 'impact';
    }
    return undefined;
  },
  contact(api, proj, _p, hit) {
    if (hit.tank >= 0) return 'impact';
    // rolling: the step follows the ground itself; the tracer only clips corners
    if (proj.data[0] === ROLL) return 'continue';
    // Landed: roll toward the side where the ground falls away more (ties: the way it was going).
    const left = depth(api, hit.freeX - 2, hit.freeY, 12);
    const right = depth(api, hit.freeX + 2, hit.freeY, 12);
    const dir = left > right ? -1 : right > left ? 1 : proj.vx < 0 ? -1 : 1;
    placeAt(proj, hit.freeX, hit.freeY);
    proj.vx = 0;
    proj.vy = 0;
    proj.data.length = 0;
    proj.data.push(ROLL, dir, 0, hit.freeY);
    return 'continue';
  },
});
