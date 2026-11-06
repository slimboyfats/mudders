import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.nuke-core', () => {
  it('waits for its fuse, then blasts the tank under it', () => {
    const w = flatWorld(150, { tankColumns: [20, 200] });
    const ticks = dropAt(w, 'weapon.nuke-core', 200);
    expect(ticks).toBeGreaterThan(40);
    expect(w.tanks[1]!.alive).toBe(false);
  });
});
