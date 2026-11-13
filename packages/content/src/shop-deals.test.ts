import { describe, expect, it } from 'vitest';
import { DEAL_OUT, DEAL_SALE } from '@mudders/sim';
import { makeWorld } from './testing';

const shop = (shopDeals: boolean, seed = 3) =>
  makeWorld({ seed, players: 2, rules: { openingShop: true, shopDeals } });

describe('shop deals', () => {
  it('puts four weapons at half price and sells two out', () => {
    const w = shop(true);
    const plain = shop(false);
    expect(w.phase).toBe('shop');
    const sale = w.deals.flatMap((d, i) => (d === DEAL_SALE ? [i] : []));
    const out = w.deals.flatMap((d, i) => (d === DEAL_OUT ? [i] : []));
    expect(sale).toHaveLength(4);
    expect(out).toHaveLength(2);
    for (const i of sale) {
      expect(w.prices[i]).toBe(Math.max(1, plain.prices[i]! >> 1));
    }
  });

  it('refuses to sell a sold-out weapon', () => {
    const w = shop(true);
    const i = w.deals.indexOf(DEAL_OUT);
    const t = w.tanks[0]!;
    t.money = 1_000_000;
    expect(w.buy(t, w.weapons[i]!.id, 1)).toBe(false);
  });

  it('changes nothing without the rule', () => {
    const w = shop(false);
    expect(w.deals.every((d) => d === 0)).toBe(true);
  });

  it('draws different deals in different matches', () => {
    const a = shop(true, 3).deals.join();
    const b = shop(true, 4).deals.join();
    expect(a).not.toBe(b);
  });
});
