import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.v3-rocket', () => {
  it('drops two spent stages that land with small pops', () => {
    const w = flatWorld(150, { tankColumns: [20, 330] });
    launchAt(w, 'weapon.v3-rocket', 40, 120, 2, -3);
    const ev = w.snapshot().effectEvents;
    // the warhead's big blast plus a small pop for each spent stage
    const small = ev.filter((e) => e.type === 'flash' && e.radius === 9);
    expect(small).toHaveLength(2);
  });

  it('dives straight down when no enemy is in range', () => {
    const w = flatWorld(150, { map: { width: 1400, height: 200 }, tankColumns: [20, 1350] });
    launchAt(w, 'weapon.v3-rocket', 300, 120, 1, -3);
    const ev = w.snapshot().effectEvents;
    const turn = ev.find((e) => e.type === 'v3Burn' && e.params.stage === 3)!;
    const blast = ev.find((e) => e.type === 'v3Blast')!;
    expect(Math.abs(blast.x - turn.x)).toBeLessThanOrEqual(8);
  });
});
