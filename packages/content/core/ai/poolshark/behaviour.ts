import { z } from '@mudders/shared';
import { defineAi } from '@mudders/sim';
import {
  dropInReach,
  buyByValue,
  cheapest,
  me,
  moneyAfter,
  moveForShot,
  solvePower,
  strongest,
  terrainWeapon,
  topUpFuel,
  weakest,
  buyGear,
  gearToUse,
  GearPlanSchema,
} from '../../../src/ai';

const params = z.strictObject({
  /** Candidate launch angles (mirrored for targets on the left). */
  angles: z.array(z.number().int().min(5).max(85)).min(1),
  /** ± degrees and ± power of deliberate error. */
  angleError: z.number().int().min(0).max(20),
  powerError: z.number().int().min(0).max(200),
  /** Money kept back in the shop. */
  reserve: z.number().int().min(0),
  /** Drive: candidate spots every `step` cells, never below `keepFuel`; shop tops up to `fuel`. */
  step: z.number().int().min(1).max(40),
  keepFuel: z.number().int().min(0),
  fuel: z.number().int().min(0),
  /** Gear it keeps in stock (§5.1). */
  gear: GearPlanSchema,
});

/**
 * Ballistic solver via the sim's own predictor: accounts for wind, gravity and terrain (§3.7).
 * Drives to a better spot when the shot from here is blocked or short, and now and then buries a
 * healthy target with a terrain weapon it bought.
 */
export default defineAi<z.infer<typeof params>>({
  kind: 'ai',
  id: 'ai.poolshark',
  version: 3,
  params,
  move(api, p) {
    const crate = dropInReach(api, p.keepFuel);
    if (crate >= 0) return crate;
    return moveForShot(
      api,
      weakest(api),
      [strongest(api).index],
      p.angles.slice(0, 3),
      p.step,
      p.keepFuel,
      6,
    );
  },
  gear(api) {
    return gearToUse(api);
  },
  aim(api, p) {
    const m = me(api);
    const target = weakest(api);
    const dirt = terrainWeapon(api);
    const w =
      target && target.health <= 25
        ? cheapest(api)
        : dirt && target && target.health > 50 && api.rng.chance(1, 4)
          ? dirt
          : strongest(api);
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
    const fuel = topUpFuel(api, p.fuel, p.reserve);
    const gear = buyGear(api, p.gear, p.reserve + api.money - moneyAfter(api, fuel));
    const spent = api.money - moneyAfter(api, [...fuel, ...gear]);
    const value = (i: (typeof api.items)[number]) => i.expectedDamage + i.terrainValue * 20;
    return [...fuel, ...gear, ...buyByValue(api, value, p.reserve + spent, 3)];
  },
});
