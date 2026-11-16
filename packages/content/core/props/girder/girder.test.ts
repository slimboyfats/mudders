import { describe, expect, it } from 'vitest';
import { countCells, dropAt, propWorld } from '../../../src/testing';

describe('prop.girder', () => {
  it('lies on the ground as a steel lattice joined in one piece', () => {
    const w = propWorld('prop.girder', 200);
    expect(countCells(w, 'material.steel')).toBeGreaterThan(60);
  });

  it('shocks a tank leaning on it when lightning strikes its far end', () => {
    // girder centred on 200: columns 188..212
    const w = propWorld('prop.girder', 200, 150, { tankColumns: [40, 360] });
    const t = w.tanks[1]!;
    t.x = 213 + t.half;
    t.y = 149;
    w.run(30);
    const hp = t.health;
    dropAt(w, 'weapon.thunderstorm-bolt', 189);
    expect(t.health).toBeLessThan(hp);
  });
});
