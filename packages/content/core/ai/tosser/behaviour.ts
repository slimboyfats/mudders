import { z } from '@mudders/shared';
import { defineAi } from '@mudders/sim';
import { buyByValue, me, nearest, solvePower, strongest } from '../../../src/ai';

const params = z.strictObject({
  /** High launch angles it tries, steepest first (mirrored for targets on the left). */
  angles: z.array(z.number().int().min(45).max(88)).min(1),
  angleError: z.number().int().min(0).max(20),
  powerError: z.number().int().min(0).max(200),
  reserve: z.number().int().min(0),
});

/**
 * Tosser (§3.7): solves the shot like Poolshark, but lobs: it only tries steep angles, so its
 * shells drop over cover onto the nearest tank, and it spends on the heaviest weapons it can.
 */
export default defineAi<z.infer<typeof params>>({
  kind: 'ai',
  id: 'ai.tosser',
  version: 1,
  params,
  aim(api, p) {
    const m = me(api);
    const target = nearest(api);
    const w = strongest(api);
    if (!target) return { weapon: w.index, angle: 90, power: 300 };
    const dir = target.x >= m.x ? 1 : -1;
    let best = { angle: dir > 0 ? p.angles[0]! : 180 - p.angles[0]!, power: 500, score: Infinity };
    for (const a of p.angles) {
      const angle = dir > 0 ? a : 180 - a;
      const s = solvePower(api, w.index, angle, target.x);
      const score = s.hit === target.player ? -1 : Math.abs(s.miss);
      if (score < best.score) best = { angle, power: s.power, score };
      if (score < 0) break;
    }
    return {
      weapon: w.index,
      angle: best.angle + api.rng.range(-p.angleError, p.angleError),
      power: best.power + api.rng.range(-p.powerError, p.powerError),
    };
  },
  shop(api, p) {
    // heavy hitters: damage counts double, and pricier tiers are preferred
    return buyByValue(api, (i) => i.expectedDamage * 2 + i.tier * 10, p.reserve, 3);
  },
});
