import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed } from '@mudders/sim';
import { placeAt } from '../../../src/flight';

const params = z.strictObject({
  /** Ticks the satellite spends locking on (the beacon blinks, a sight line flickers) before it fires. */
  chargeTicks: z.number().int().min(1).max(240),
  /** Cells per tick the beam's head comes down through open air. */
  speed: z.number().min(1).max(32),
  /** How far below the ground at the beacon's column the beam bores before it goes off. */
  depth: z.number().int().min(1).max(400),
  maxTicks: z.number().int().min(1),
});

/** `proj.data` slots. */
const PHASE = 0;
const END_Y = 1;

/**
 * Orbital lance (§5.1 beams): a beacon has landed; the shell stays put for `chargeTicks` while
 * the satellite locks on, then jumps to the top of the map and comes straight down the beacon's
 * column, ignoring wind and gravity. Terrain does not stop it: every solid cell it meets runs the
 * weapon's pulse impacts (the cutting) and it carries on, so it bores a vertical shaft until it
 * is `depth` cells below where the ground was, and then goes off. A tank in the way is burned
 * by every pulse as the beam passes down through it, then drops into the shaft.
 *
 * Effect events (cosmetic): `lanceCharge` at the beacon when it lands (radius 0, `ticks` = lock
 * time) and `lance` when it fires, at the bottom of the shaft-to-be (`top` = 0).
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.orbital-lance',
  version: 1,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    const g = api.grid;
    const x = Math.max(0, Math.min(g.width - 1, Math.floor(proj.x / FP)));
    if (proj.data.length === 0) {
      proj.data.push(0, 0);
      proj.vx = 0;
      proj.vy = 0;
      api.emit('lanceCharge', x, Math.floor(proj.y / FP), 0, { ticks: p.chargeTicks });
    }
    if (proj.data[PHASE] === 0) {
      if (proj.age < p.chargeTicks) return 'skip';
      // fire: from the top of the sky straight down the beacon's column
      const surface = g.surfaceY(x);
      const end = Math.min(g.height - 2, Math.max(surface, Math.floor(proj.y / FP)) + p.depth);
      proj.data[PHASE] = 1;
      proj.data[END_Y] = end;
      placeAt(proj, x, 0);
      proj.vy = toFixed(p.speed);
      api.emit('lance', x, end, 0, { surface });
      return 'skip';
    }
    const end = proj.data[END_Y]!;
    proj.y += proj.vy;
    if (Math.floor(proj.y / FP) >= end) {
      placeAt(proj, x, end);
      return 'impact';
    }
    return undefined;
  },
  contact(_api, proj, _p, hit) {
    if (hit.y >= proj.data[END_Y]!) return 'impact';
    // burn through terrain and tanks alike: cut here (the pulse hurts a tank it passes through)
    // and carry on down from this cell next tick
    placeAt(proj, hit.x, hit.y);
    return 'pulse';
  },
});
