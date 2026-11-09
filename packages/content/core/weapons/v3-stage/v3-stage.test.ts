import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.v3-stage', () => {
  it('falls and goes off with a small pop', () => {
    const w = flatWorld(150, { tankColumns: [20, 330] });
    launchAt(w, 'weapon.v3-stage', 200, 40, 0, 0);
    const pops = w.snapshot().effectEvents.filter((e) => e.type === 'flash');
    expect(pops).toHaveLength(1);
    expect(pops[0]!.radius).toBe(9);
  });
});
