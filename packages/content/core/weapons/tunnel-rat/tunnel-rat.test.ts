import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { flatWorld } from '../../../src/testing';

const world = () => flatWorld(150, { map: { width: 600, height: 300 }, tankColumns: [40, 560] });

function boreAndPress(depth: number): {
  x: number;
  y: number;
  hole: (x: number, y: number) => boolean;
} {
  const w = world();
  const idx = w.weaponByIndex('weapon.tunnel-rat');
  w.tanks[0]!.inventory[idx] = 1;
  w.applyInput(0, { type: 'selectWeapon', weapon: 'weapon.tunnel-rat' });
  w.applyInput(0, { type: 'aim', angle: 45, power: 300 });
  w.applyInput(0, { type: 'fire' });
  let at = { x: 0, y: 0 };
  w.step();
  for (let n = 0; n < 2000 && w.phase === 'resolve'; n++) {
    w.step();
    const p = w.projectiles.find((s) => s.alive && s.weapon === idx);
    if (p && depth > 0 && Math.floor(p.y / 65536) >= 150 + depth) {
      at = { x: Math.floor(p.x / 65536), y: Math.floor(p.y / 65536) };
      w.applyInput(0, { type: 'fire' });
      depth = 0;
    }
  }
  const g = w.grid;
  return { ...at, hole: (x, y) => g.material[y * g.width + x] === 0 };
}

describe('weapon.tunnel-rat', () => {
  it('loads and resolves', () => {
    expect(loadContent().has('weapon.tunnel-rat')).toBe(true);
  });

  it('blows a cavern underground where it is when pressed', () => {
    const r = boreAndPress(20);
    expect(r.y).toBeGreaterThanOrEqual(170);
    // a blast-sized hollow around the press point, under the surface
    expect(r.hole(r.x + 15, r.y)).toBe(true);
    expect(r.hole(r.x - 15, r.y)).toBe(true);
  });
});
