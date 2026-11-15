import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('explosion.landing', () => {
  it('is the standard blast with the landing-picked burst style', () => {
    const c = loadContent();
    const e = c.get('explosion', 'explosion.landing');
    const std = c.get('explosion', 'explosion.standard');
    expect(e.radius).toBe(std.radius);
    expect(e.damage).toBe(std.damage);
    expect(e.effects.burst?.style).toBe(9);
  });

  it('is what the Missile blows up with', () => {
    const w = loadContent().get('weapon', 'weapon.missile');
    const ex = w.impact.find((i) => 'explosion' in i);
    expect(ex && 'explosion' in ex ? ex.explosion.effects.burst?.style : -1).toBe(9);
  });
});
