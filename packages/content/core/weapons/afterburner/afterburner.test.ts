import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { fireAndPress, flatWorld } from '../../../src/testing';

const world = () => flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
const settle = (w: ReturnType<typeof world>) => {
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
};

describe('weapon.afterburner', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.afterburner')).toBe(true);
  });

  it('doubles its speed when lit', () => {
    const w = world();
    const at = fireAndPress(w, 'weapon.afterburner', 60, 700, 30);
    expect(at).not.toBeNull();
    const stage = w.weaponByIndex('weapon.afterburner-stage');
    const p = w.projectiles.find((s) => s.weapon === stage)!;
    expect(Math.abs(p.vx)).toBeGreaterThan(Math.abs(at!.vx) * 1.8);
    settle(w);
  });
});
