import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.sand-flask', () => {
  it('pours a little heap of sand where it smashes', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.sand-flask', 200);
    const sand = w.mats.cellOf('material.sand');
    const g = w.grid;
    let n = 0;
    let sum = 0;
    for (let i = 0; i < g.material.length; i++) {
      if (g.material[i] !== sand) continue;
      n++;
      sum += i % g.width;
    }
    expect(n).toBe(countCells(w, 'material.sand'));
    // half a disc of radius 12
    expect(n).toBeGreaterThan(160);
    expect(n).toBeLessThan(320);
    expect(Math.abs(sum / n - 200)).toBeLessThan(6);
    expect(g.surfaceY(200)).toBeLessThan(150);
    expect(w.tanks.every((t) => t.health === 100)).toBe(true);
    expect(w.quiet).toBe(true);
  });
});
