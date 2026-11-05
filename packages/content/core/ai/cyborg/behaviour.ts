import { z } from '@mudders/shared';
import { defineAi, type AiApi, type AiTankView } from '@mudders/sim';
import { buyByValue, enemies, me, solvePower } from '../../../src/ai';

const params = z.strictObject({
  angles: z.array(z.number().int().min(5).max(88)).min(1),
  /** How many of its most damaging weapons it tries before settling for the best near miss. */
  weapons: z.number().int().min(1).max(8),
  reserve: z.number().int().min(0),
});

/** Weakest enemy; between equally weak ones the closest (ties: lower player number). */
function prey(api: AiApi): AiTankView | undefined {
  const m = me(api);
  let best: AiTankView | undefined;
  for (const t of enemies(api)) {
    const d = Math.abs(t.x - m.x);
    if (
      !best ||
      t.health < best.health ||
      (t.health === best.health && d < Math.abs(best.x - m.x))
    ) {
      best = t;
    }
  }
  return best;
}

/**
 * Cyborg (§3.7): near-perfect aim. Picks the weakest enemy (closest on a tie), then tries its
 * most damaging weapons and every candidate angle through the sim's own predictor until one
 * lands on the target, with no deliberate error. Shops for damage per coin with a tiny reserve.
 */
export default defineAi<z.infer<typeof params>>({
  kind: 'ai',
  id: 'ai.cyborg',
  version: 1,
  params,
  aim(api, p) {
    const m = me(api);
    const target = prey(api);
    const ranked = api.weapons
      .filter((w) => w.expectedDamage > 0)
      .sort((a, b) => b.expectedDamage - a.expectedDamage || a.index - b.index)
      .slice(0, p.weapons);
    const first = ranked[0] ?? api.weapons[0]!;
    if (!target) return { weapon: first.index, angle: 90, power: 300 };
    const dir = target.x >= m.x ? 1 : -1;
    let best = { weapon: first.index, angle: 90, power: 300, score: Infinity };
    for (const w of ranked) {
      for (const a of p.angles) {
        const angle = dir > 0 ? a : 180 - a;
        const s = solvePower(api, w.index, angle, target.x, 12);
        const score = s.hit === target.player ? -1 : Math.abs(s.miss);
        if (score < best.score) best = { weapon: w.index, angle, power: s.power, score };
        if (score < 0) return { weapon: w.index, angle, power: s.power };
      }
    }
    return { weapon: best.weapon, angle: best.angle, power: best.power };
  },
  shop(api, p) {
    return buyByValue(api, (i) => i.expectedDamage, p.reserve, 4);
  },
});
