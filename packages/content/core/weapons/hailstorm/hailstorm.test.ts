import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { dropAt, flatWorld, passTurns } from '../../../src/testing';

describe('weapon.hailstorm', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.hailstorm')).toBe(true);
  });

  it('pounds a tank under its cloud over the next turns', () => {
    const w = flatWorld(150, { map: { width: 600, height: 260 }, tankColumns: [60, 300] });
    const t = w.tanks[1]!;
    t.shield = 0;
    const h0 = t.health;
    dropAt(w, 'weapon.hailstorm', 300);
    passTurns(w, 4);
    expect(h0 - t.health).toBeGreaterThanOrEqual(30);
  });
});
