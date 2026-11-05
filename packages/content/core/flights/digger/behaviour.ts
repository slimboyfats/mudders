import { z } from '@mudders/shared';
import { defineFlight, toFixed } from '@mudders/sim';
import { ballisticStep, cellX, cellY, placeAt, solidAt, withSpeed } from '../../../src/flight';

const params = z.strictObject({
  gravityScale: z.number().min(0).max(10),
  windScale: z.number().min(-10).max(10),
  maxTicks: z.number().int().min(1),
  /** Cells per tick while tunnelling (keep it below the pulse's carve radius). */
  speed: z.number().min(0.25).max(6),
  /** Ticks it keeps digging. */
  length: z.number().int().min(1).max(600),
  /** Cells ahead it looks for open air to tell it has come out the other side. */
  probe: z.number().int().min(1).max(32),
  /** What happens when it breaks out into air, or runs out of length or into something it can't dig. */
  exit: z.enum(['impact', 'die']),
  end: z.enum(['impact', 'die']),
});

// mode 0 = flying
const DIG = 1;
// data: [mode, dvx, dvy, dug]

/**
 * Digger (§5.1): flies an arc, then bores on through the ground in the direction it was going,
 * pulsing the weapon's tunnel op every tick, until it breaks out, runs out of length, or meets a
 * tank or something it can't dig. A Sandhog goes off at the end; a plain digger just stops.
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.digger',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.data[0] !== DIG) {
      ballisticStep(api, proj, p.gravityScale, p.windScale);
      return undefined;
    }
    const dvx = proj.data[1]!;
    const dvy = proj.data[2]!;
    proj.x += dvx;
    proj.y += dvy;
    const dug = proj.data[3]! + 1;
    proj.data[3] = dug;
    if (dug >= p.length) return p.end;
    const x = cellX(proj);
    const y = cellY(proj);
    const ax = x + Math.trunc((dvx * p.probe) / toFixed(p.speed));
    const ay = y + Math.trunc((dvy * p.probe) / toFixed(p.speed));
    if (dug > 2 && !solidAt(api, x, y) && !solidAt(api, ax, ay)) return p.exit;
    return 'pulse';
  },
  contact(_api, proj, p, hit) {
    if (hit.tank >= 0) return 'impact';
    if (proj.data[0] === DIG) {
      // the tunnel didn't clear this cell: too hard to dig
      return p.end;
    }
    const [dvx, dvy] = withSpeed(proj.vx, proj.vy, toFixed(p.speed));
    placeAt(proj, hit.x, hit.y);
    proj.vx = dvx;
    proj.vy = dvy;
    proj.data.length = 0;
    proj.data.push(DIG, dvx, dvy, 0);
    return 'pulse';
  },
});
