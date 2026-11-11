import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.cloud-whale', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('terrainop.cloud-whale')).toBe(true);
  });

  it('never let go: drops from above the spot, craters it and floods it with water', () => {
    const w = flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 400] });
    let popY = -1;
    const emit = w.emit.bind(w);
    w.emit = (type, x, y, r, p) => {
      if (type === 'whalePop') popY = y;
      emit(type, x, y, r, p);
    };
    dropAt(w, 'weapon.cloud-whale', 400, 4000);
    expect(popY).toBeLessThan(150 - 50);
    expect(w.phase).not.toBe('resolve');
    expect(w.tanks[1]!.health).toBeLessThan(70);
    expect(countCells(w, 'material.water')).toBeGreaterThan(600);
    expect(w.grid.surfaceY(400)).toBeGreaterThan(150);
  });
});
