import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.heavy-shockwave', () => {
  it('shoves further than the standard Shockwave and keeps the mass', () => {
    const push = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [40, 260] });
      dropAt(w, wpn, 200);
      return w.tanks[1]!.x - 260;
    };
    expect(push('weapon.heavy-shockwave')).toBeGreaterThan(push('weapon.shockwave'));
    // wide enough that the flung dirt lands on the map
    const w = flatWorld(150, { map: { width: 800, height: 200 }, tankColumns: [40, 760] });
    const before = countCells(w);
    dropAt(w, 'weapon.heavy-shockwave', 400);
    expect(before - countCells(w)).toBeLessThan(before * 0.02);
  });
});
