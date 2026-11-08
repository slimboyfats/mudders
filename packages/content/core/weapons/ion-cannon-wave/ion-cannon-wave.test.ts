import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.ion-cannon-wave', () => {
  it('shoves the ground and nearby tanks without a crater of its own', () => {
    const w = flatWorld(150, { tankColumns: [20, 230] });
    const x0 = w.tanks[1]!.x;
    dropAt(w, 'weapon.ion-cannon-wave', 200);
    expect(w.tanks[1]!.alive).toBe(true);
    expect(w.tanks[1]!.x).not.toBe(x0);
  });
});
