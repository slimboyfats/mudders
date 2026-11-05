import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld, propWorld } from '../../../src/testing';

describe('weapon.incendiary', () => {
  it('barely dents dirt but burns a tree down', () => {
    const plain = flatWorld();
    const dirt = countCells(plain, 'material.dirt');
    dropAt(plain, 'weapon.incendiary', 200);
    expect(dirt - countCells(plain, 'material.dirt')).toBeLessThan(300);
    const w = propWorld('prop.tree', 200);
    dropAt(w, 'weapon.incendiary', 200);
    expect(countCells(w, 'material.wood')).toBeLessThan(10);
  });
});
