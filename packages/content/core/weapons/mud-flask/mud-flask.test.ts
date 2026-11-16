import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.mud-flask', () => {
  it('leaves a heap of mud where it smashes', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.mud-flask', 200);
    const mud = w.mats.cellOf('material.mud');
    const g = w.grid;
    let n = 0;
    let sum = 0;
    for (let i = 0; i < g.material.length; i++) {
      if (g.material[i] !== mud) continue;
      n++;
      sum += i % g.width;
    }
    // half a disc of radius 12
    expect(n).toBeGreaterThan(160);
    expect(n).toBeLessThan(320);
    expect(Math.abs(sum / n - 200)).toBeLessThan(6);
    // it heaps up over the old surface
    expect(g.surfaceY(200)).toBeLessThan(150);
    expect(w.tanks.every((t) => t.health === 100)).toBe(true);
    expect(w.quiet).toBe(true);
  });
});
