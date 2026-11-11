import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { fireAndPress, flatWorld } from '../../../src/testing';

const world = () => flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
const settle = (w: ReturnType<typeof world>) => {
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
};

describe('weapon.flock-call', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.flock-call')).toBe(true);
  });

  it('lets out six birds that go for the enemy', () => {
    const w = world();
    const at = fireAndPress(w, 'weapon.flock-call', 60, 700, 30);
    expect(at).not.toBeNull();
    const bird = w.weaponByIndex('weapon.flock-bird');
    expect(w.projectiles.filter((p) => p.alive && p.weapon === bird)).toHaveLength(6);
    settle(w);
    expect(w.tanks[1]!.health).toBeLessThan(100);
  });
});
