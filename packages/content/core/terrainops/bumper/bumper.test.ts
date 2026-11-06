import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

const wide = { map: { width: 1200, height: 300 } };

/** Distance tank 1 is thrown when the post lands `gap` cells to its left. */
function thrown(gap: number): number {
  const w = flatWorld(200, { ...wide, tankColumns: [60, 300] });
  dropAt(w, 'weapon.bumper', 300 - gap);
  return w.tanks[1]!.x - 300;
}

describe('terrainop.bumper', () => {
  it('throws a tank right next to the post much farther than one at the edge of its reach', () => {
    const near = thrown(4);
    const far = thrown(38);
    expect(far).toBeGreaterThan(60);
    expect(near).toBeGreaterThan(far + 40);
  });

  it('leaves tanks out of reach alone', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 300] });
    dropAt(w, 'weapon.bumper', 230);
    expect(w.tanks[1]!.x).toBe(300);
    expect(w.tanks[1]!.health).toBe(100);
  });

  it('touches no terrain beyond the shell’s own small dent', () => {
    const w = flatWorld(200, { ...wide, tankColumns: [60, 600] });
    const before = countCells(w);
    dropAt(w, 'weapon.bumper', 300);
    expect(before - countCells(w)).toBeLessThan(260);
  });
});
