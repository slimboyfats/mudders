import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('explosion.dirty', () => {
  it('is the standard blast with the dirty burst style', () => {
    const c = loadContent();
    const dirty = c.get('explosion', 'explosion.dirty');
    const std = c.get('explosion', 'explosion.standard');
    expect(dirty.radius).toBe(std.radius);
    expect(dirty.damage).toBe(std.damage);
    expect(dirty.effects.burst?.style).toBe(3);
  });

  it('is what the rollers blow up with', () => {
    const c = loadContent();
    for (const id of ['weapon.roller', 'weapon.heavy-roller', 'weapon.baby-roller']) {
      const w = c.get('weapon', id);
      const ex = w.impact.find((i) => 'explosion' in i);
      expect(ex && 'explosion' in ex ? ex.explosion.effects.burst?.style : -1).toBe(3);
    }
  });
});
