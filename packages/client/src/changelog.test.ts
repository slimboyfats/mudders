import { describe, expect, it } from 'vitest';
import { loadContent } from '@mudders/content';
import { CHANGELOG, compareSince, isNew, NEW_SINCE } from './changelog';
import { sortShop } from './ui/Shop';
import type { ShopItem } from './game/match';

describe('changelog', () => {
  it('lists entries newest first with unique dates', () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
    for (const e of CHANGELOG) expect(e.items.length).toBeGreaterThan(0);
  });

  it('compares pack versions numerically', () => {
    expect(compareSince('core@0.9.0', 'core@0.10.0')).toBeLessThan(0);
    expect(compareSince('core@0.60.0', 'core@0.44.0')).toBeGreaterThan(0);
    expect(compareSince('core@0.44.0', 'core@0.44.0')).toBe(0);
  });

  it('marks only the newest wave of shop weapons as new', () => {
    expect(NEW_SINCE).toBeDefined();
    const weapons = loadContent()
      .list('weapon')
      .filter((w) => w.shop.price > 0);
    const fresh = weapons.filter((w) => isNew(w.meta.since)).map((w) => w.id);
    expect(fresh).toContain('weapon.bog-flask');
    expect(fresh).not.toContain('weapon.mirv');
    expect(fresh.length).toBeLessThan(weapons.length / 2);
  });
});

describe('shop sort', () => {
  const item = (id: string, o: Partial<ShopItem>): ShopItem => ({
    id,
    name: id,
    description: '',
    category: 'blast',
    price: 100,
    pack: 1,
    ...o,
  });
  const items = [
    item('shield', { gear: { max: 3 }, price: 50 }),
    item('a', { since: 'core@0.9.0', blast: 30, damage: 40, price: 300 }),
    item('b', { since: 'core@0.10.0', blast: 10, damage: 90, price: 200 }),
  ];
  const ids = (by: Parameters<typeof sortShop>[1]) => sortShop(items, by).map((i) => i.id);

  it('keeps the default order for price and puts gear last otherwise', () => {
    expect(ids('price')).toEqual(['shield', 'a', 'b']);
    expect(ids('new')).toEqual(['b', 'a', 'shield']);
    expect(ids('blast')).toEqual(['a', 'b', 'shield']);
    expect(ids('damage')).toEqual(['b', 'a', 'shield']);
    expect(ids('name')).toEqual(['a', 'b', 'shield']);
  });
});
