import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.flock-bird', () => {
  it('goes off where it lands and hurts a tank under it', () => {
    const w = flatWorld(150, { tankColumns: [20, 200] });
    dropAt(w, 'weapon.flock-bird', 200);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });
});
