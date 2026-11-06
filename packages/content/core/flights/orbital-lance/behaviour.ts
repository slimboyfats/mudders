import { z } from '@mudders/shared';
import { FP, defineFlight, toFixed, type MaterialTable, type SimApi } from '@mudders/sim';
import { placeAt } from '../../../src/flight';

const params = z.strictObject({
  /** Ticks the satellite spends locking on (the beacon blinks, a sight line flickers) before it fires. */
  chargeTicks: z.number().int().min(1).max(240),
  /** Cells per tick the beam's head comes down through open air. */
  speed: z.number().min(1).max(32),
  /** How far below the ground at the beacon's column the beam bores before it goes off. */
  depth: z.number().int().min(1).max(400),
  maxTicks: z.number().int().min(1),
  /** Materials that mirror the beam (crystal): it stops on them and is thrown back to the sky. */
  mirror: z.array(z.string().startsWith('material.')).default([]),
});

/** `proj.data` slots. */
const PHASE = 0;
const END_Y = 1;
/** 1 when a mirror cuts the beam short: it bounces back up at END_Y instead of going off. */
const MIRRORED = 2;

/**
 * Orbital lance (§5.1 beams): a beacon has landed; the shell stays put for `chargeTicks` while
 * the satellite locks on, then jumps to the top of the map and comes straight down the beacon's
 * column, ignoring wind and gravity. Terrain does not stop it: every solid cell it meets runs the
 * weapon's pulse impacts (the cutting) and it carries on, so it bores a vertical shaft until it
 * is `depth` cells below where the ground was, and then goes off. A tank in the way is burned
 * by every pulse as the beam passes down through it, then drops into the shaft.
 *
 * A `mirror` cell (crystal) in the column stops the beam: it bores down to the mirror and is
 * thrown straight back up to the sky without going off, so crystal overhead is cover.
 *
 * Effect events (cosmetic): `lanceCharge` at the beacon when it lands (radius 0, `ticks` = lock
 * time) and `lance` when it fires, at the bottom of the shaft-to-be (`top` = 0).
 */
export default defineFlight<z.infer<typeof params>>({
  kind: 'flight',
  id: 'flight.orbital-lance',
  version: 2,
  params,
  maxTicks: (p) => p.maxTicks,
  step(api, proj, p) {
    const g = api.grid;
    const x = Math.max(0, Math.min(g.width - 1, Math.floor(proj.x / FP)));
    if (proj.data.length === 0) {
      proj.data.push(0, 0, 0);
      proj.vx = 0;
      proj.vy = 0;
      api.emit('lanceCharge', x, Math.floor(proj.y / FP), 0, { ticks: p.chargeTicks });
    }
    if (proj.data[PHASE] === 0) {
      if (proj.age < p.chargeTicks) return 'skip';
      // fire: from the top of the sky straight down the beacon's column
      const surface = g.surfaceY(x);
      let end = Math.min(g.height - 2, Math.max(surface, Math.floor(proj.y / FP)) + p.depth);
      if (p.mirror.length > 0) {
        for (let y = 0; y < end; y++) {
          const m = g.material[y * g.width + x]!;
          if (m === 0 || !isMirror(api.mats, m, p.mirror)) continue;
          end = Math.max(0, y - 1);
          proj.data[MIRRORED] = 1;
          break;
        }
      }
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
      if (proj.data[MIRRORED] === 1) return bounceBack(api, x, end);
      return 'impact';
    }
    return undefined;
  },
  contact(api, proj, _p, hit) {
    if (hit.y >= proj.data[END_Y]!) {
      if (proj.data[MIRRORED] === 1) return bounceBack(api, hit.x, proj.data[END_Y]!);
      return 'impact';
    }
    // burn through terrain and tanks alike: cut here (the pulse hurts a tank it passes through)
    // and carry on down from this cell next tick
    placeAt(proj, hit.x, hit.y);
    return 'pulse';
  },
});

function isMirror(mats: MaterialTable, m: number, mirror: readonly string[]): boolean {
  for (const id of mirror) if (mats.cellOf(id) === m) return true;
  return false;
}

/** The beam meets a mirror: a flash where it struck, and it leaves for the sky without going off. */
function bounceBack(api: SimApi, x: number, y: number): 'die' {
  api.emit('reflect', x, y + 1, 6, { vx: 0, vy: -14 * 256 });
  return 'die';
}
