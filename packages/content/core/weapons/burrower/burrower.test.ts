import { describe, expect, it } from 'vitest';
import { effectsOf, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.burrower', () => {
  it('burrows in, then goes off at the end of its tunnel', () => {
    const w = flatWorld(100, { tankColumns: [20, 380], map: { width: 400, height: 400 } });
    launchAt(w, 'weapon.burrower', 200, 90, 0, 2);
    const hits = effectsOf(w, 'burst');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.y).toBeGreaterThan(160);
  });
});
