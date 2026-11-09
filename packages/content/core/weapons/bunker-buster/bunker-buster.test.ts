import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../src/index';
import { dropAt, flatWorld } from '../../../src/testing';

/** Player 1's tank sits in a bunker: a 16-row rock roof over it on two rock pillars. */
function bunkerWorld(): World {
  const w = flatWorld();
  const g = w.grid;
  const W = g.width;
  const rock = w.mats.cellOf('material.rock');
  for (let y = 100; y < 150; y++) {
    for (let x = 320; x < 400; x++) {
      const roof = y < 116;
      const pillar = x < 326 || x >= 394;
      if (roof || pillar) g.material[y * W + x] = rock;
    }
  }
  g.clearSettle();
  return w;
}

describe('weapon.bunker-buster', () => {
  it('punches through a rock roof and goes off inside the bunker', () => {
    const w = bunkerWorld();
    const t = w.tanks[1]!;
    const hp = t.health;
    dropAt(w, 'weapon.bunker-buster', t.x);
    expect(t.health).toBeLessThan(hp - 40);
  });

  it('where a missile only scars the roof', () => {
    const w = bunkerWorld();
    const t = w.tanks[1]!;
    const hp = t.health;
    dropAt(w, 'weapon.missile', t.x);
    expect(t.health).toBe(hp);
  });

  it('goes off deep in solid ground once its punch runs out', () => {
    const w = flatWorld();
    dropAt(w, 'weapon.bunker-buster', 200);
    // a shaft down, then the blast well under the surface: the column is open far below row 150
    const g = w.grid;
    let open = 0;
    for (let y = 150; y < 200; y++) if (g.get(200, y) === 0) open++;
    expect(open).toBeGreaterThan(30);
  });

  it('is a damage weapon for bots', () => {
    const c = loadContent().get('weapon', 'weapon.bunker-buster');
    expect(c).toMatchObject({ ai: { expectedDamage: 55 } });
  });
});
