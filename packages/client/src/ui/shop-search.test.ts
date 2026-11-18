import { describe, expect, it } from 'vitest';
import type { ShopItem } from '../game/match';
import { matchesSearch } from './Shop';

const item = (name: string, description: string, category = 'explosive'): ShopItem => ({
  id: `weapon.${name.toLowerCase().replace(/\s+/g, '-')}`,
  name,
  description,
  category,
  price: 1000,
  pack: 1,
});

describe('shop search', () => {
  const nuke = item('Baby Nuke', 'A very big bang. Carves a deep crater.');
  const roller = item('Heavy Roller', 'Lands, then rolls downhill.', 'roller');

  it('finds by name, kind or description, ignoring case', () => {
    expect(matchesSearch(nuke, 'NUKE')).toBe(true);
    expect(matchesSearch(nuke, 'crater')).toBe(true);
    expect(matchesSearch(nuke, 'explosive')).toBe(true);
    expect(matchesSearch(roller, 'nuke')).toBe(false);
  });

  it('needs every word typed, in any order', () => {
    expect(matchesSearch(roller, 'downhill heavy')).toBe(true);
    expect(matchesSearch(roller, 'heavy nuke')).toBe(false);
  });

  it('an empty box finds everything', () => {
    expect(matchesSearch(nuke, '')).toBe(true);
    expect(matchesSearch(nuke, '   ')).toBe(true);
  });
});
