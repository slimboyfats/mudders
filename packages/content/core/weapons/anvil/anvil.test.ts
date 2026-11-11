import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { fireAndPress, flatWorld } from '../../../src/testing';

const world = () => flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
const settle = (w: ReturnType<typeof world>) => {
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
};

describe('weapon.anvil', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.anvil')).toBe(true);
  });

  it('drops straight down from where it was let go', () => {
    const w = world();
    const at = fireAndPress(w, 'weapon.anvil', 60, 700, 30);
    expect(at).not.toBeNull();
    settle(w);
    // a hole right under the press point, far short of where the shell was headed
    expect(w.grid.surfaceY(at!.x)).toBeGreaterThan(152);
    expect(at!.x).toBeLessThan(300);
  });
});
