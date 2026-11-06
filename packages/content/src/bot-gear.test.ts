import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { flatten, makeWorld } from './testing';

/** Two bots on a flat calm map; player 0 is up first. */
function botWorld(bot: string, gear: Record<string, number> = {}, health?: number): World {
  const w = makeWorld({
    seed: 5,
    map: { width: 800, height: 300 },
    tankColumns: [200, 600],
    turnOrder: [0, 1],
    wind: 0,
    bots: [bot, bot],
    tankSetup: [{ inventory: gear, ...(health !== undefined ? { health: 100 } : {}) }],
    rules: { suddenDeath: false, rounds: 3, startingCash: 20_000 },
  });
  flatten(w, 200);
  if (health !== undefined) w.tanks[0]!.health = health;
  return w;
}

const idx = (w: World, id: string) => w.gear.findIndex((g) => g.id === id);

describe('bots use gear (§3.7, §5.1)', () => {
  it('raise a shield before their shot, and stop at one', () => {
    for (const bot of ['ai.cyborg', 'ai.poolshark', 'ai.tosser', 'ai.shooter']) {
      const w = botWorld(bot, { 'gear.shield': 3 });
      const t = w.tanks[0]!;
      for (let i = 0; i < 2000 && w.phase === 'aim'; i++) w.step();
      expect(t.shield, bot).toBe(50);
      expect(t.gear[idx(w, 'gear.shield')], bot).toBe(2);
    }
  });

  it('use a battery when hurt, not at full health', () => {
    const hurt = botWorld('ai.cyborg', { 'gear.battery': 2 }, 40);
    for (let i = 0; i < 2000 && hurt.phase === 'aim'; i++) hurt.step();
    expect(hurt.tanks[0]!.health).toBe(70);
    const fine = botWorld('ai.cyborg', { 'gear.battery': 2 });
    for (let i = 0; i < 2000 && fine.phase === 'aim'; i++) fine.step();
    expect(fine.tanks[0]!.gear[idx(fine, 'gear.battery')]).toBe(2);
  });

  it('buy their gear plan in the shop, and still buy weapons', () => {
    const plans: Record<string, [number, number, number]> = {
      'ai.cyborg': [2, 2, 1],
      'ai.poolshark': [2, 1, 1],
      'ai.tosser': [2, 1, 0],
      'ai.shooter': [0, 1, 2],
    };
    for (const [bot, [chute, shield, battery]] of Object.entries(plans)) {
      const w = botWorld(bot);
      const t = w.tanks[0]!;
      t.health = 0;
      t.alive = false;
      // the other bot finishes the round; then both shop
      for (let i = 0; i < 20_000 && w.phase !== 'shop'; i++) w.step();
      expect(w.phase, bot).toBe('shop');
      const shields = t.gear[idx(w, 'gear.shield')]! + t.gear[idx(w, 'gear.heavy-shield')]!;
      expect(
        [t.gear[idx(w, 'gear.parachute')], shields, t.gear[idx(w, 'gear.battery')]],
        bot,
      ).toEqual([chute, shield, battery]);
      const bought = t.inventory.reduce((n, c, i) => n + (c > 0 && i !== 0 ? c : 0), 0);
      expect(bought, bot).toBeGreaterThan(17);
    }
  });
});
