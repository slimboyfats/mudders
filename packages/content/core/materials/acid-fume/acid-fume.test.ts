import { describe, expect, it } from 'vitest';
import { flatWorld } from '../../../src/testing';

describe('material.acid-fume', () => {
  it('is a harmless gas that thins away on its own', () => {
    const w = flatWorld();
    const fume = w.mats.cellOf('material.acid-fume');
    const g = w.grid;
    for (let y = 100; y < 110; y++) for (let x = 190; x < 210; x++) g.putGas(y * g.width + x, fume);
    g.markDirty(190, 100, 209, 109);
    const count = () => g.gas.reduce((n, c) => n + (c === fume ? 1 : 0), 0);
    expect(count()).toBe(200);
    for (let t = 0; t < 1200; t++) w.step();
    expect(count()).toBe(0);
    expect(w.tanks.every((tk) => tk.health === 100)).toBe(true);
  });
});
