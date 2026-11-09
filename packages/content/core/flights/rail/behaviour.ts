import { z } from '@mudders/shared';
import { defineFlight, toFixed } from '@mudders/sim';
import { ballisticStep, placeAt, withSpeed } from '../../../src/flight';

const params = z.strictObject({
  /** Cells per tick along the aim line; power only sets the direction. */
  speed: z.number().min(1).max(16),
  maxTicks: z.number().int().min(1),
  /** Share of normal gravity: a slug this fast barely drops. */
  gravityScale: z.number().min(0).max(1),
  windScale: z.number().min(-1).max(1),
  /**
   * Terrain the slug may bore through, in cells. Every contact with the ground bores `bore`
   * cells (the weapon's pulse) and spends that much; hard rock the pulse can't cut spends it
   * every tick, so the slug stops quickly in it. Out of budget, it goes off where it is.
   */
  pierce: z.number().int().min(0).max(256),
  bore: z.number().int().min(1).max(16),
});

/** `proj.data` slots: 0 = started, 1 = cells of terrain bored so far. */
const BORED = 1;

/**
 * Rail (Railgun): a hyper-velocity slug. It leaves the barrel at a fixed, very high speed along
 * the aim, shrugs off the wind and drops only a little. It punches through thin ground (a ridge,
 * a wall, a house) but not through a hill: once it has bored `pierce` cells it goes off. The first
 * tank in its line stops it.
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.rail',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    if (proj.data.length === 0) {
      const [vx, vy] = withSpeed(proj.vx, proj.vy, toFixed(p.speed));
      proj.vx = vx;
      proj.vy = vy;
      proj.data.push(1, 0);
    }
    ballisticStep(api, proj, p.gravityScale, p.windScale);
    return undefined;
  },
  contact(api, proj, p, hit) {
    if (hit.tank >= 0) return 'impact';
    const bored = (proj.data[BORED] ?? 0) + p.bore;
    if (bored > p.pierce) return 'impact';
    proj.data[BORED] = bored;
    placeAt(proj, hit.x, hit.y);
    return 'pulse';
  },
});
