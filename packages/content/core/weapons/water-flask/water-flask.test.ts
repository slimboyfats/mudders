import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.water-flask', () => {
  it('leaves a small pool of water where it smashes, and nothing else', () => {
    const w = flatWorld();
    const ground = () => countCells(w, 'material.dirt') + countCells(w, 'material.mud');
    const dirt = ground();
    dropAt(w, 'weapon.water-flask', 200);
    const water = countCells(w, 'material.water');
    // half a disc of radius 14 above the ground
    expect(water).toBeGreaterThan(200);
    expect(water).toBeLessThan(420);
    // no crater (the water soaks a little dirt to mud, which still counts)
    expect(dirt - ground()).toBeLessThan(20);
    // the pool lies around the hit
    const g = w.grid;
    const cell = w.mats.cellOf('material.water');
    let sum = 0;
    for (let i = 0; i < g.material.length; i++) if (g.material[i] === cell) sum += i % g.width;
    expect(Math.abs(sum / water - 200)).toBeLessThan(15);
    expect(w.tanks.every((t) => t.health === 100)).toBe(true);
  });
});
