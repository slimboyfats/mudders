import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { fireAndPress, flatWorld } from '../../../src/testing';

describe('weapon.anvil-rain', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.anvil-rain')).toBe(true);
  });

  it('lets go of several anvils that each punch a hole', () => {
    const w = flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
    const at = fireAndPress(w, 'weapon.anvil-rain', 60, 700, 30);
    expect(at).not.toBeNull();
    for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
    let holes = 0;
    let prev = false;
    for (let x = 0; x < 600; x++) {
      const deep = w.grid.surfaceY(x) > 156;
      if (deep && !prev) holes++;
      prev = deep;
    }
    expect(holes).toBeGreaterThanOrEqual(3);
  });
});
