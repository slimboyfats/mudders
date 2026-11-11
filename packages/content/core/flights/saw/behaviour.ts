import { z } from '@mudders/shared';
import { defineFlight, toFixed } from '@mudders/sim';
import { ballisticStep, cellX, cellY, placeAt, solidAt, stickyAt } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
  /** Columns sawn per tick. */
  speed: z.number().int().min(1).max(4),
  /** Highest step it climbs from one column to the next; anything taller it cuts through. */
  maxClimb: z.number().int().min(0).max(6),
  /** A drop deeper than this and it leaves the ground and flies again. */
  drop: z.number().int().min(2).max(24),
  /**
   * Depth of the groove its own pulse cuts ahead of it: ground falling away by no more than this
   * is taken as the groove and it keeps its height (so it doesn't sink into its own cut).
   */
  groove: z.number().int().min(0).max(8),
  /** Ticks of sawing before it goes off wherever it is. */
  maxRun: z.number().int().min(1).max(600),
});

const FLY = 0;
const SAW = 1;
// data: [mode, dir, run]

/** How far the ground falls away below (x, y), up to `max`. */
function depth(api: Parameters<typeof solidAt>[0], x: number, y: number, max: number): number {
  let k = 0;
  while (k < max && !solidAt(api, x, y + k + 1)) k++;
  return k;
}

/**
 * Saw (Buzzsaw): flies a normal arc; on landing it runs along the ground in the direction it was
 * fired (not downhill, unlike a roller), `speed` columns a tick, pulsing the weapon's cut every
 * tick. It climbs steps up to `maxClimb`, follows the ground down, and saws straight through
 * anything taller. It goes off when it bites a tank, when the ground it is in won't cut (the
 * pulse left its own cell solid), when it sticks in tar, or after `maxRun` ticks.
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.saw',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.data[0] !== SAW) {
      ballisticStep(api, proj, p.gravityScale, p.windScale);
      return undefined;
    }
    const dir = proj.data[1]!;
    // last tick's cut didn't clear the cell it sits in: too hard to saw
    if (proj.data[2]! > 0 && solidAt(api, cellX(proj), cellY(proj))) return 'impact';
    for (let s = 0; s < p.speed; s++) {
      const x = cellX(proj);
      const y = cellY(proj);
      const nx = x + dir;
      if (nx < 0 || nx >= api.grid.width) {
        placeAt(proj, nx, y); // off the edge: the wall rule decides
        return undefined;
      }
      let ny = y;
      if (solidAt(api, nx, y)) {
        let k = 1;
        while (k <= p.maxClimb && solidAt(api, nx, y - k)) k++;
        // too tall to climb: saw straight on through it
        ny = k > p.maxClimb ? y : y - k;
      } else {
        const d = depth(api, nx, y, p.drop);
        if (d >= p.drop) {
          // ran off a ledge: fly again, keeping the sawing speed
          proj.data[0] = FLY;
          placeAt(proj, nx, y);
          proj.vx = dir * toFixed(p.speed);
          proj.vy = 0;
          return undefined;
        }
        if (d > p.groove) ny = y + d - p.groove;
      }
      placeAt(proj, nx, ny);
      if (stickyAt(api, nx, ny + 1)) return 'impact';
    }
    const run = proj.data[2]! + 1;
    proj.data[2] = run;
    if (run >= p.maxRun) return 'impact';
    return 'pulse';
  },
  contact(api, proj, _p, hit) {
    if (hit.tank >= 0) return 'impact';
    // sawing: the step picks the path and the pulse cuts it; the tracer only clips corners
    if (proj.data[0] === SAW) return 'continue';
    if (stickyAt(api, hit.x, hit.y)) return 'impact';
    // landed: saw on the way it was flying (straight down: to the right)
    placeAt(proj, hit.freeX, hit.freeY);
    const dir = proj.vx < 0 ? -1 : 1;
    proj.vx = 0;
    proj.vy = 0;
    proj.data.length = 0;
    proj.data.push(SAW, dir, 0);
    return 'pulse';
  },
});
