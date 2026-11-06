import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.firework-rocket', () => {
  it('climbs until it stalls, then bursts high in the sky into six stars', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    launchAt(w, 'weapon.firework-rocket', 200, 120, 0, -1);
    const ev = w.snapshot().effectEvents;
    const bursts = ev.filter((e) => e.type === 'fireworkBurst');
    expect(bursts).toHaveLength(1);
    expect(bursts[0]!.y).toBeLessThan(100);
    expect(ev.filter((e) => e.type === 'fireworkStar')).toHaveLength(6);
  });

  it('bursts without touching the ground', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    const before = w.grid.material.reduce((n, m) => n + (m !== 0 ? 1 : 0), 0);
    launchAt(w, 'weapon.firework-rocket', 200, 60, 0, -1);
    // only the stars nick the ground: six pops of radius 5, far less than one crater
    const after = w.grid.material.reduce((n, m) => n + (m !== 0 ? 1 : 0), 0);
    expect(before - after).toBeLessThan(6 * 90);
  });
});
