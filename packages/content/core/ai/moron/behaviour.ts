import { z } from '@mudders/shared';
import { AI_FUEL, defineAi, type AiPurchase } from '@mudders/sim';
import { enemies, me } from '../../../src/ai';

const params = z.strictObject({
  minPower: z.number().int().min(0).max(1000),
  maxPower: z.number().int().min(0).max(1000),
});

/**
 * Random angle (towards the enemies' side), power and weapon; never adjusts (§3.7). Half its
 * turns it drives off somewhere at random first.
 */
export default defineAi<z.infer<typeof params>>({
  kind: 'ai',
  id: 'ai.moron',
  version: 2,
  params,
  move(api) {
    if (!api.rng.chance(1, 2)) return me(api).x;
    const r = api.reach(api.rng.chance(1, 2) ? -1 : 1);
    return r.length > 0 ? r[api.rng.int(r.length)]!.x : me(api).x;
  },
  aim(api, p) {
    const m = me(api);
    const foes = enemies(api);
    const left = foes.filter((t) => t.x < m.x).length;
    const towardLeft = left * 2 > foes.length || (left * 2 === foes.length && api.rng.chance(1, 2));
    const a = api.rng.range(25, 80);
    const w = api.weapons[api.rng.int(api.weapons.length)]!;
    return {
      weapon: w.index,
      angle: towardLeft ? 180 - a : a,
      power: api.rng.range(p.minPower, Math.max(p.minPower, p.maxPower)),
    };
  },
  shop(api) {
    const out: AiPurchase[] = [];
    const items = api.items.filter((i) => i.price > 0 && i.count >= 0);
    let money = api.money;
    if (api.fuel < api.fuelMax && api.fuelPrice <= money && api.rng.chance(1, 3)) {
      out.push({ item: AI_FUEL, packs: 1 });
      money -= api.fuelPrice;
    }
    for (let k = 0; k < 3 && items.length > 0; k++) {
      const it = items[api.rng.int(items.length)]!;
      if (it.price <= money) {
        out.push({ item: it.index, packs: 1 });
        money -= it.price;
      }
    }
    return out;
  },
});
