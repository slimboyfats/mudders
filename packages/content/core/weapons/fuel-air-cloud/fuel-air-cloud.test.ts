import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.fuel-air-cloud', () => {
  it('drifts as fuel vapour and goes off on its timer as a ball of fire', () => {
    const w = loadContent().get('weapon', 'weapon.fuel-air-cloud');
    expect(w.flight.ref).toBe('flight.fuel-drift');
    expect(w.triggers).toContainEqual({ onTimer: 80 });
    expect(w.triggers).not.toContain('onTank');
    const imp = w.impact[0]!;
    expect('explosion' in imp && imp.explosion.damageType).toBe('heat');
  });

  it('is not sold on its own', () => {
    expect(loadContent().get('weapon', 'weapon.fuel-air-cloud').shop.price).toBe(0);
  });
});
