import { z } from '@mudders/shared';
import { defineAi } from '@mudders/sim';
import { enemies, me } from '../../../src/ai';

const params = z.strictObject({
  minPower: z.number().int().min(0).max(1000),
  maxPower: z.number().int().min(0).max(1000),
});

/** Random angle (towards the enemies' side), power and weapon; never adjusts (§3.7). */
export default defineAi<z.infer<typeof params>>({
  kind: 'ai',
  id: 'ai.moron',
  version: 1,
  params,
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
    const out: { item: number; packs: number }[] = [];
    const items = api.items.filter((i) => i.price > 0 && i.count >= 0);
    let money = api.money;
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
