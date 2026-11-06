import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.mirv', () => {
  it('splits into five warheads at the apex that land in a line', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    launchAt(w, 'weapon.mirv', 80, 120, 2, -3);
    const ev = w.snapshot().effectEvents;
    expect(ev.filter((e) => e.type === 'mirvSplit')).toHaveLength(1);
    const hits = ev.filter((e) => e.type === 'geyser');
    expect(hits).toHaveLength(5);
    const xs = hits.map((h) => h.x).sort((a, b) => a - b);
    expect(xs[4]! - xs[0]!).toBeGreaterThan(60);
  });

  it('lands the far warheads last, one after another', () => {
    const w = flatWorld(150, { tankColumns: [20, 380] });
    launchAt(w, 'weapon.mirv', 80, 120, 2, -3);
    const hits = w.snapshot().effectEvents.filter((e) => e.type === 'geyser');
    const byX = [...hits].sort((a, b) => a.x - b.x);
    for (let i = 1; i < byX.length; i++) expect(byX[i]!.tick).toBeGreaterThan(byX[i - 1]!.tick);
  });
});
