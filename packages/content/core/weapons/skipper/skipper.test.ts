import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.skipper', () => {
  it('goes off three times, hopping along the ground', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    launchAt(w, 'weapon.skipper', 100, 120, 2, 2);
    const hits = effectsOf(w, 'burst');
    expect(hits).toHaveLength(3);
    expect(hits[1]!.x).toBeGreaterThan(hits[0]!.x + 10);
    expect(hits[2]!.x).toBeGreaterThan(hits[1]!.x + 10);
  });
});
