import { z } from '@mudders/shared';
import { defineAi } from '@mudders/sim';
import { buyByValue, cheapest, me, solvePower, strongest, weakest } from '../../../src/ai';

const params = z.strictObject({
  /** Candidate launch angles (mirrored for targets on the left). */
  angles: z.array(z.number().int().min(5).max(85)).min(1),
  /** ± degrees and ± power of deliberate error. */
  angleError: z.number().int().min(0).max(20),
  powerError: z.number().int().min(0).max(200),
  /** Money kept back in the shop. */
  reserve: z.number().int().min(0),
});

/** Ballistic solver via the sim's own predictor: accounts for wind, gravity and terrain (§3.7). */
export default defineAi<z.infer<typeof params>>({
  kind: 'ai',
  id: 'ai.poolshark',
  version: 1,
  params,
  aim(api, p) {
    const m = me(api);
    const target = weakest(api);
    const w = target && target.health <= 25 ? cheapest(api) : strongest(api);
    if (!target) return { weapon: w.index, angle: 90, power: 300 };
    const dir = target.x >= m.x ? 1 : -1;
    let best = { angle: 90, power: 300, score: Infinity };
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
    return buyByValue(api, (i) => i.expectedDamage + i.terrainValue * 20, p.reserve, 3);
  },
});
