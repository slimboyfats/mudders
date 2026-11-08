import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.ion-cannon-core', () => {
  it('waits out the charge, then blasts the tank under it', () => {
    const w = flatWorld(150, { tankColumns: [20, 200] });
    const ticks = dropAt(w, 'weapon.ion-cannon-core', 200);
    expect(ticks).toBeGreaterThan(60);
    expect(w.tanks[1]!.alive).toBe(false);
  });
});
