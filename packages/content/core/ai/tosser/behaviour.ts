import { z } from '@mudders/shared';
import { defineAi } from '@mudders/sim';
import {
  buyByValue,
  driveEnd,
  me,
  moneyAfter,
  moveForShot,
  nearest,
  solvePower,
  strongest,
  terrainWeapon,
  topUpFuel,
  buyGear,
  gearToUse,
  GearPlanSchema,
} from '../../../src/ai';

const params = z.strictObject({
  /** High launch angles it tries, steepest first (mirrored for targets on the left). */
  angles: z.array(z.number().int().min(45).max(88)).min(1),
  angleError: z.number().int().min(0).max(20),
  powerError: z.number().int().min(0).max(200),
  reserve: z.number().int().min(0),
  /** Backs away to keep at least `minRange` cells from the nearest tank (lobs need room). */
  minRange: z.number().int().min(0),
  step: z.number().int().min(1).max(40),
  keepFuel: z.number().int().min(0),
  fuel: z.number().int().min(0),
  /** Gear it keeps in stock (§5.1). */
  gear: GearPlanSchema,
});

/**
 * Tosser (§3.7): solves the shot like Poolshark, but lobs: it only tries steep angles, so its
 * shells drop over cover onto the nearest tank, and it spends on the heaviest weapons it can.
 * It drives to keep its distance, or to a spot where a lob gets through.
 */
export default defineAi<z.infer<typeof params>>({
  kind: 'ai',
  id: 'ai.tosser',
  version: 3,
  params,
  move(api, p) {
    const m = me(api);
    const target = nearest(api);
    if (!target) return m.x;
    if (Math.abs(target.x - m.x) < p.minRange) {
      return driveEnd(api, target.x >= m.x ? -1 : 1, p.keepFuel);
    }
    return moveForShot(
      api,
      target,
      [strongest(api).index],
      p.angles.slice(0, 2),
      p.step,
      p.keepFuel,
      8,
    );
  },
  gear(api) {
    return gearToUse(api);
  },
  aim(api, p) {
    const m = me(api);
    const target = nearest(api);
    const dirt = terrainWeapon(api);
    const w = dirt && target && target.health > 60 && api.rng.chance(1, 5) ? dirt : strongest(api);
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
    const fuel = topUpFuel(api, p.fuel, p.reserve);
    const gear = buyGear(api, p.gear, p.reserve + api.money - moneyAfter(api, fuel));
    const spent = api.money - moneyAfter(api, [...fuel, ...gear]);
    const value = (i: (typeof api.items)[number]) => i.expectedDamage * 2 + i.tier * 10;
    return [...fuel, ...gear, ...buyByValue(api, value, p.reserve + spent, 3)];
  },
});
