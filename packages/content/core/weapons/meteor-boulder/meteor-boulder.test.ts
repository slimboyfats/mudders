import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.meteor-boulder', () => {
  it('digs a bigger slag-lined crater than a small meteor', () => {
    const dug = (weapon: string): number => {
      const w = flatWorld(150, { tankColumns: [20, 380] });
      const before = countCells(w);
      dropAt(w, weapon, 200);
      return before - countCells(w);
    };
    expect(dug('weapon.meteor-boulder')).toBeGreaterThan(dug('weapon.meteor') * 2);
  });
});
