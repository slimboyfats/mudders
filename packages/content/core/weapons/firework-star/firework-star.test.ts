import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.firework-star', () => {
  it('drifts down slowly and pops on the ground', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const ticks = launchAt(w, 'weapon.firework-star', 200, 50, 0, 0);
    const pops = w.snapshot().effectEvents.filter((e) => e.type === 'fireworkStar');
    expect(pops).toHaveLength(1);
    expect(Math.abs(pops[0]!.y - 150)).toBeLessThan(4);
    // far slower than a plain shell falling the same 100 cells
    expect(ticks).toBeGreaterThan(60);
  });

  it('nicks a tank it lands next to', () => {
    const w = flatWorld(150, { tankColumns: [20, 202] });
    launchAt(w, 'weapon.firework-star', 200, 120, 0, 0);
    expect(w.tanks[1]!.health).toBeLessThan(100);
    expect(w.tanks[1]!.health).toBeGreaterThan(85);
  });
});
