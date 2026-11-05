import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.digger', () => {
  it('tunnels down from where it lands', () => {
    const w = flatWorld(100, { tankColumns: [20, 380], map: { width: 400, height: 400 } });
    launchAt(w, 'weapon.digger', 200, 90, 0, 2);
    const g = w.grid;
    let deepest = 100;
    for (let y = 100; y < g.height; y++) if (g.material[y * g.width + 200] === 0) deepest = y;
    expect(deepest).toBeGreaterThan(200);
    expect(g.material[(g.height - 1) * g.width + 200]).not.toBe(0);
  });

  it('digs further than a Baby Digger', () => {
    const depth = (wpn: string) => {
      const w = flatWorld(100, { tankColumns: [20, 380], map: { width: 400, height: 400 } });
      launchAt(w, wpn, 200, 90, 0, 2);
      const g = w.grid;
      let d = 0;
      for (let y = 100; y < g.height; y++) if (g.material[y * g.width + 200] === 0) d = y;
      return d;
    };
    expect(depth('weapon.digger')).toBeGreaterThan(depth('weapon.baby-digger'));
  });
});
