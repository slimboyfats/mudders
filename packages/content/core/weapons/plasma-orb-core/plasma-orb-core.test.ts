import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';

describe('weapon.plasma-orb-core', () => {
  it('hovers on the plasma-orb flight and bursts on a timer into a throwing shockwave', () => {
    const w = loadContent().get('weapon', 'weapon.plasma-orb-core');
    expect(w.flight).toMatchObject({ ref: 'flight.plasma-orb' });
    expect(w.triggers).toEqual([{ onTimer: 150 }]);
    const ring = w.impact[1];
    expect(ring && 'explosion' in ring && ring.explosion.terrainOp?.['fling']).toBeGreaterThan(0);
  });
});
