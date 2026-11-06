import { describe, expect, it } from 'vitest';
import { MAP_SIZES } from '@mudders/shared';
import { countCells, makeWorld } from '../../../src/testing';

describe('gen.islands', () => {
  it('puts every tank on its own island high above the ground, deterministically', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      for (const [seed, players] of [
        [1, 2],
        [2, 5],
        [3, 8],
      ] as const) {
        const opts = { seed, players, map: { ...MAP_SIZES[size], generator: 'gen.islands' } };
        const w = makeWorld(opts);
        expect(w.hash()).toBe(makeWorld(opts).hash());
        expect(w.quiet).toBe(true);
        const g = w.grid;
        const H = g.height;
        const stone = w.mats.cellOf('material.floatstone');
        for (const t of w.tanks) {
          // standing on its island, far above the floor, with open air above
          expect(t.y).toBeLessThan(H * 0.6);
          expect(g.surfaceY(t.x)).toBe(t.y);
          // floatstone holds the island up somewhere under the tank, then a drop
          let y = t.y;
          while (y < H && g.material[y * g.width + t.x] !== stone) y++;
          while (y < H && g.material[y * g.width + t.x] === stone) y++;
          let air = 0;
          while (y < H && g.material[y * g.width + t.x] === 0) {
            air++;
            y++;
          }
          expect(air).toBeGreaterThan(H * 0.2);
        }
      }
    }
  });

  it('drops the dirt and its tank once the stone under the island is blasted away', () => {
    const w = makeWorld({
      seed: 4,
      players: 2,
      map: { ...MAP_SIZES.small, generator: 'gen.islands' },
      rules: { turnTimer: 0, suddenDeath: false },
    });
    const g = w.grid;
    const t = w.tanks[0]!;
    const y0 = t.y;
    const stone = w.mats.cellOf('material.floatstone');
    const before = countCells(w, 'material.floatstone');
    for (let x = t.x - 30; x < t.x + 30; x++) {
      for (let y = 0; y < g.height; y++) if (g.material[y * g.width + x] === stone) g.set(x, y, 0);
    }
    g.markDirty(t.x - 30, 0, t.x + 30, g.height - 1);
    for (let i = 0; i < 3000 && !w.quiet; i++) w.step();
    expect(countCells(w, 'material.floatstone')).toBeLessThan(before);
    expect(t.y).toBeGreaterThan(y0 + g.height * 0.2);
  });
});
