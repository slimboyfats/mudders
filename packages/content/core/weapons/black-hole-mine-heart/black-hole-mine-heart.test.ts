import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.black-hole-mine-heart', () => {
  it('hangs for a moment, then eats a round pit without throwing debris', () => {
    const w = flatWorld(150, { tankColumns: [40, 215] });
    const b = countCells(w);
    const ticks = dropAt(w, 'weapon.black-hole-mine-heart', 200);
    expect(ticks).toBeGreaterThan(50);
    expect(countCells(w)).toBeLessThan(b);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    const ev = w.snapshot().effectEvents;
    expect(ev.some((e) => e.type === 'swallow')).toBe(true);
  });
});
