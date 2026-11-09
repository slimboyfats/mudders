import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.supernova', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.supernova')).toBe(true);
  });

  it('burns, blows up and leaves glowing slag', () => {
    const w = flatWorld(150, { map: { width: 800, height: 240 }, tankColumns: [60, 470] });
    const ticks = dropAt(w, 'weapon.supernova', 400);
    expect(ticks).toBeGreaterThan(150);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(countCells(w, 'material.lance-slag')).toBeGreaterThan(50);
  });
});
