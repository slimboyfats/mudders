import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.mirv', () => {
  it('splits into five warheads at the apex that land in a line', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    launchAt(w, 'weapon.mirv', 80, 120, 2, -3);
    const hits = effectsOf(w, 'burst');
    expect(hits).toHaveLength(5);
    const xs = hits.map((h) => h.x).sort((a, b) => a - b);
    expect(xs[4]! - xs[0]!).toBeGreaterThan(40);
  });
});
