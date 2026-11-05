import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.singularity-core', () => {
  it('hangs in the air for a moment, then goes off', () => {
    const w = flatWorld(150, { tankColumns: [20, 230] });
    const ticks = dropAt(w, 'weapon.singularity-core', 200);
    expect(ticks).toBeGreaterThan(30);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });
});
