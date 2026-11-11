import { z } from '@mudders/shared';
import { defineAi, type AiApi, type AiTankView } from '@mudders/sim';
import {
  dropInReach,
  buyByValue,
  enemies,
  me,
  moneyAfter,
  moveForShot,
  solvePower,
  topUpFuel,
  buyGear,
  gearToUse,
  GearPlanSchema,
} from '../../../src/ai';

const params = z.strictObject({
  angles: z.array(z.number().int().min(5).max(88)).min(1),
  /** How many of its most damaging weapons it tries before settling for the best near miss. */
  weapons: z.number().int().min(1).max(8),
  reserve: z.number().int().min(0),
  /** Drive: candidate spots every `step` cells; it tops its fuel up to `fuel` in the shop. */
  step: z.number().int().min(1).max(40),
  fuel: z.number().int().min(0),
  /** Gear it keeps in stock (§5.1). */
  gear: GearPlanSchema,
});

/** Its most damaging weapons, best first. */
function ranked(api: AiApi, n: number) {
  return api.weapons
    .filter((w) => w.expectedDamage > 0)
    .sort((a, b) => b.expectedDamage - a.expectedDamage || a.index - b.index)
    .slice(0, n);
}

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
 * lands on the target, with no deliberate error. When no shot connects from where it stands it
 * drives to the nearest spot that has one (§3.2). Shops for fuel, then damage per coin.
 */
export default defineAi<z.infer<typeof params>>({
  kind: 'ai',
  id: 'ai.cyborg',
  version: 3,
  params,
  move(api, p) {
    const crate = dropInReach(api, 0);
    if (crate >= 0) return crate;
    const best = ranked(api, 1)[0] ?? api.weapons[0]!;
    return moveForShot(api, prey(api), [best.index], p.angles.slice(0, 4), p.step, 0, 3);
  },
  gear(api) {
    return gearToUse(api);
  },
  aim(api, p) {
    const m = me(api);
    const target = prey(api);
    const top = ranked(api, p.weapons);
    const first = top[0] ?? api.weapons[0]!;
    if (!target) return { weapon: first.index, angle: 90, power: 300 };
    const dir = target.x >= m.x ? 1 : -1;
    let best = { weapon: first.index, angle: 90, power: 300, score: Infinity };
    for (const w of top) {
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
    const fuel = topUpFuel(api, p.fuel, p.reserve);
    const gear = buyGear(api, p.gear, p.reserve + api.money - moneyAfter(api, fuel));
    const spent = api.money - moneyAfter(api, [...fuel, ...gear]);
    return [...fuel, ...gear, ...buyByValue(api, (i) => i.expectedDamage, p.reserve + spent, 4)];
  },
});
