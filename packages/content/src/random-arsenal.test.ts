import { describe, expect, it } from 'vitest';
import { makeWorld } from './testing';

const match = (randomArsenal: boolean, seed = 3) =>
  makeWorld({ seed, players: 2, rules: { openingShop: true, randomArsenal } });

describe('random arsenal', () => {
  it('hands every tank the same four free weapons, one pack each', () => {
    const w = match(true);
    const plain = match(false);
    expect(w.arsenal).toHaveLength(4);
    expect(new Set(w.arsenal).size).toBe(4);
    for (const i of w.arsenal) {
      const weapon = w.weapons[i]!;
      expect(weapon.price).toBeGreaterThan(0);
      for (const [p, t] of w.tanks.entries()) {
        expect(t.inventory[i]).toBe(plain.tanks[p]!.inventory[i]! + Math.max(1, weapon.pack));
      }
    }
  });

  it('changes nothing without the rule', () => {
    const w = match(false);
    expect(w.arsenal).toHaveLength(0);
  });

  it('draws a different arsenal in different matches', () => {
    expect(match(true, 3).arsenal.join()).not.toBe(match(true, 4).arsenal.join());
  });
});
