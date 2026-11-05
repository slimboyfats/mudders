import { describe, expect, it } from 'vitest';
import { flatWorld, launchAt } from '../../../src/testing';

describe('weapon.laser', () => {
  it('cuts a thin, deep channel straight down', () => {
    const w = flatWorld(100, { tankColumns: [20, 380], map: { width: 400, height: 400 } });
    launchAt(w, 'weapon.laser', 200, 90, 0, 1);
    const g = w.grid;
    expect(g.material[360 * g.width + 200]).toBe(0);
    expect(g.surfaceY(200 + 6)).toBe(100);
  });

  it('stops at the first tank in its path and hurts it', () => {
    const w = flatWorld(150, { tankColumns: [20, 300] });
    launchAt(w, 'weapon.laser', 100, 145, 1, 0);
    expect(w.tanks[1]!.health).toBe(55);
  });
});
