import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.hornet', () => {
  it('steers into an enemy tank off its line', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    launchAt(w, 'weapon.hornet', 200, 60, 1, 0);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(w.tanks[0]!.health).toBe(100);
  });
});
