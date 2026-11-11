import { describe, expect, it } from 'vitest';
import { blastLoss, countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.frag-shard', () => {
  it('chips a tiny pit and stings a tank it lands next to', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const b = countCells(w);
    dropAt(w, 'weapon.frag-shard', 200);
    expect(b - countCells(w)).toBeGreaterThan(5);
    expect(b - countCells(w)).toBeLessThan(120);
    expect(blastLoss(null, null, 2, 'weapon.frag-shard')).toBeGreaterThan(5);
  });
});
