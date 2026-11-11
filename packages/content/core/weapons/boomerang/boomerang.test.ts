import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { fireAndPress, flatWorld } from '../../../src/testing';

const world = () => flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });
const settle = (w: ReturnType<typeof world>) => {
  for (let n = 0; n < 3000 && w.phase === 'resolve'; n++) w.step();
};

describe('weapon.boomerang', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.boomerang')).toBe(true);
  });

  it('turns round and flies back', () => {
    const w = world();
    const at = fireAndPress(w, 'weapon.boomerang', 60, 700, 30);
    expect(at).not.toBeNull();
    const back = w.weaponByIndex('weapon.boomerang-return');
    const p = w.projectiles.find((s) => s.weapon === back)!;
    expect(Math.sign(p.vx)).toBe(-Math.sign(at!.vx));
    settle(w);
  });
});
