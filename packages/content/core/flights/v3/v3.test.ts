import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('flight.v3', () => {
  it('climbs high after the arc, then dives on to the enemy tank', () => {
    const w = flatWorld(150, { tankColumns: [20, 330] });
    launchAt(w, 'weapon.v3-rocket', 40, 120, 2, -3);
    const ev = w.snapshot().effectEvents;
    const burns = ev.filter((e) => e.type === 'v3Burn');
    expect(burns.map((b) => b.params.stage)).toEqual([2, 3]);
    // stage 3 lights high in the sky
    expect(burns[1]!.y).toBeLessThanOrEqual(14);
    const blast = ev.find((e) => e.type === 'v3Blast');
    expect(blast).toBeDefined();
    expect(Math.abs(blast!.x - 330)).toBeLessThanOrEqual(10);
    expect(w.tanks[1]!.alive).toBe(false);
  });
});
