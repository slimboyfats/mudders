import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { fireAndPress, flatWorld } from '../../../src/testing';

const world = () => flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
const settle = (w: ReturnType<typeof world>) => {
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
};

describe('weapon.split-now', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.split-now')).toBe(true);
  });

  it('splits into five warheads where it was let go', () => {
    const w = world();
    const at = fireAndPress(w, 'weapon.split-now', 60, 700, 30);
    expect(at).not.toBeNull();
    const warhead = w.weaponByIndex('weapon.mirv-warhead');
    expect(w.projectiles.filter((p) => p.alive && p.weapon === warhead)).toHaveLength(5);
    settle(w);
    expect(w.phase).not.toBe('resolve');
  });
});
