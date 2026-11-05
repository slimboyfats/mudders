import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.baby-digger', () => {
  it('tunnels down from where it lands', () => {
    const w = flatWorld(100, { tankColumns: [20, 380], map: { width: 400, height: 400 } });
    launchAt(w, 'weapon.baby-digger', 200, 90, 0, 2);
    const g = w.grid;
    let deepest = 100;
    for (let y = 100; y < g.height; y++) if (g.material[y * g.width + 200] === 0) deepest = y;
    expect(deepest).toBeGreaterThan(130);
    expect(g.material[(g.height - 1) * g.width + 200]).not.toBe(0);
  });
});
