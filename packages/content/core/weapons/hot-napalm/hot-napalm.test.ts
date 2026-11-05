import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.hot-napalm', () => {
  it('burns a tank and scorches more ground than Napalm', () => {
    const run = (wpn: string) => {
      const w = flatWorld(150, { tankColumns: [20, 212] });
      dropAt(w, wpn, 200);
      return { ash: countCells(w, 'material.ash'), hp: w.tanks[1]!.health };
    };
    const hot = run('weapon.hot-napalm');
    expect(hot.hp).toBeLessThan(100);
    expect(hot.ash).toBeGreaterThan(run('weapon.napalm').ash);
  });
});
