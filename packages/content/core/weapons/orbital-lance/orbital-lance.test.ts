import { describe, expect, it } from 'vitest';
import { countCells, flatWorld, launchAt } from '../../../src/testing';

describe('weapon.orbital-lance', () => {
  it('calls a beam down onto the beacon that bores a deep slag-lined shaft', () => {
    const w = flatWorld(150, { tankColumns: [40, 360], map: { width: 400, height: 400 } });
    launchAt(w, 'weapon.orbital-lance', 200, 140, 0, 1);
    const g = w.grid;
    // the shaft goes far deeper than any blast this size would
    expect(g.material[(150 + 40) * g.width + 200]).toBe(0);
    // its walls are glowing slag, ringed by scorched earth
    expect(countCells(w, 'material.lance-slag')).toBeGreaterThan(100);
    expect(countCells(w, 'material.scorch')).toBeGreaterThan(100);
    // the ground beside the shaft mouth is untouched further out
    expect(g.surfaceY(200 + 40)).toBe(150);
  });

  it('a beacon next to a tank brings the beam down on it for a heavy hit', () => {
    const w = flatWorld(150, { tankColumns: [40, 200], map: { width: 400, height: 400 } });
    launchAt(w, 'weapon.orbital-lance', 200, 140, 0, 1);
    expect(w.tanks[1]!.health).toBeLessThanOrEqual(40);
  });

  it('cuts through cover overhead', () => {
    const w = flatWorld(150, { tankColumns: [40, 360], map: { width: 400, height: 400 } });
    const g = w.grid;
    const dirt = w.mats.cellOf('material.dirt');
    // a dirt roof hanging over the target column
    for (let y = 100; y < 110; y++)
      for (let x = 180; x < 220; x++) g.material[y * g.width + x] = dirt;
    launchAt(w, 'weapon.orbital-lance', 200, 120, 0, 1);
    expect(g.material[105 * g.width + 200]).toBe(0);
    expect(g.material[(150 + 30) * g.width + 200]).toBe(0);
  });
});
