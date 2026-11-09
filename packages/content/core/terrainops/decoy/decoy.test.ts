import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('terrainop.decoy', () => {
  it('stands a decoy on the ground at the impact, on the shooter’s team', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    dropAt(w, 'weapon.decoy-tank', 200);
    expect(w.lures).toHaveLength(1);
    const l = w.lures[0]!;
    expect([l.x, l.y, l.owner, l.hp, l.alive]).toEqual([200, 150, 0, 50, true]);
  });

  it('drops when the ground under it goes, and pops off the bottom of the map', () => {
    const w = flatWorld(150, { tankColumns: [40, 360] });
    const i = w.addLure(200, 150, 0, 60);
    const g = w.grid;
    for (let y = 150; y < 170; y++) for (let x = 180; x < 220; x++) g.material[y * g.width + x] = 0;
    w.run(40);
    expect(w.lures[i]!.y).toBe(170);
  });
});
