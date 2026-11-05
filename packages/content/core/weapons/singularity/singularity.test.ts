import { describe, expect, it } from 'vitest';
import { countCells, dropAt, effectsOf, flatWorld } from '../../../src/testing';

describe('weapon.singularity', () => {
  it('heaps the ground, then blows it outward and hurts a tank nearby', () => {
    const w = flatWorld(150, { tankColumns: [20, 240] });
    const b = countCells(w);
    const ticks = dropAt(w, 'weapon.singularity', 200);
    expect(ticks).toBeGreaterThan(48);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(effectsOf(w, 'flash').length).toBeGreaterThan(0);
    expect(countCells(w)).toBeLessThan(b);
  });
});
