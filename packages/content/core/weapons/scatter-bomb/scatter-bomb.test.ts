import { describe, expect, it } from 'vitest';
import { dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('weapon.scatter-bomb', () => {
  it('flings a fan of bomblets that land across the ground around it', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    dropAt(w, 'weapon.scatter-bomb', 200);
    const hits = effectsOf(w, 'burst');
    expect(hits).toHaveLength(8);
    const xs = hits.map((h) => h.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(60);
  });
});
