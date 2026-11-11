import { describe, expect, it } from 'vitest';
import { dropAt, flatWorld } from '../../../src/testing';

describe('weapon.afterburner-stage', () => {
  it('goes off where it lands and hurts a tank under it', () => {
    const w = flatWorld(150, { tankColumns: [20, 200] });
    dropAt(w, 'weapon.afterburner-stage', 200);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });
});
