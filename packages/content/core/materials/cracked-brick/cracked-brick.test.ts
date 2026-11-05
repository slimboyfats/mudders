import { describe, expect, it } from 'vitest';
import { countCells, dropAt, propWorld } from '../../../src/testing';

describe('material.cracked-brick', () => {
  it('appears on house walls as their integrity drops, and is weaker than brick', () => {
    const w = propWorld('prop.house', 200);
    expect(countCells(w, 'material.cracked-brick')).toBe(0);
    for (let k = 0; k < 8 && w.groups.stage[1] === 0 && w.groups.broken[1] === 0; k++)
      dropAt(w, 'weapon.missile', 186 + k * 4);
    if (w.groups.broken[1] === 0)
      expect(countCells(w, 'material.cracked-brick')).toBeGreaterThan(20);
    const b = w.mats.cellOf('material.brick');
    const c = w.mats.cellOf('material.cracked-brick');
    expect(w.mats.strengthOf(c, 0)).toBeLessThan(w.mats.strengthOf(b, 0));
  });
});
