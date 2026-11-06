import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.sinkhole', () => {
  it('drops a tank standing on the impact to the bottom of a deep pit, and hurts it', () => {
    const w = flatWorld(150, { tankColumns: [20, 400], map: { width: 800, height: 300 } });
    const before = w.tanks[1]!.health;
    dropAt(w, 'weapon.sinkhole', 400);
    const t = w.tanks[1]!;
    expect(t.y).toBeGreaterThan(200);
    expect(t.health).toBeLessThan(before);
  });

  it('leaves the pit walls steep: deep in the middle, untouched a little way out', () => {
    const w = flatWorld(150, { tankColumns: [20, 780], map: { width: 800, height: 300 } });
    dropAt(w, 'weapon.sinkhole', 400);
    const g = w.grid;
    expect(g.surfaceY(400)).toBeGreaterThan(205);
    expect(g.surfaceY(330)).toBeLessThanOrEqual(152);
    expect(g.surfaceY(470)).toBeLessThanOrEqual(152);
  });
});
