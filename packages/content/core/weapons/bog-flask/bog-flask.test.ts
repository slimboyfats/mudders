import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.bog-flask', () => {
  it('leaves a harmless cloud of marsh gas that a fire shot sets off', () => {
    const w = flatWorld();
    const gas = w.mats.cellOf('material.marsh-gas');
    const count = () => w.grid.gas.reduce((n, g) => n + (g === gas ? 1 : 0), 0);
    dropAt(w, 'weapon.bog-flask', 200);
    const cloud = count();
    expect(cloud).toBeGreaterThan(800);
    // nothing in it burns by itself
    w.run(120);
    expect(count()).toBe(cloud);
    dropAt(w, 'weapon.incendiary', 200);
    w.run(300);
    expect(count()).toBeLessThan(cloud / 3);
  });
});
