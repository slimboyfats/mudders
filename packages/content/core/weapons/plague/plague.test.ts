import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld, passTurns } from '../../../src/testing';

describe('weapon.plague', () => {
  it('hurts tanks in its cloud at the end of each turn, for four turns', () => {
    const w = flatWorld(150, { tankColumns: [40, 210] });
    dropAt(w, 'weapon.plague', 200);
    expect(w.zones).toHaveLength(1);
    const hp = w.tanks[1]!.health;
    expect(hp).toBeLessThan(100 - 7);
    passTurns(w, 3);
    expect(w.tanks[1]!.health).toBe(hp - 42);
    expect(w.zones).toHaveLength(0);
    passTurns(w, 1);
    expect(w.tanks[1]!.health).toBe(hp - 42);
    expect(w.tanks[0]!.health).toBe(100);
  });
});
