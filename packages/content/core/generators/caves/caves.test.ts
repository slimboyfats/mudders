import { describe, expect, it } from 'vitest';
import { MAP_SIZES } from '@mudders/shared';
import { makeWorld } from '../../../src/testing';

describe('gen.caves', () => {
  it('starts every tank on the cave floor under the roof, deterministically', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      for (const [seed, players] of [
        [1, 2],
        [2, 5],
        [3, 8],
      ] as const) {
        const opts = { seed, players, map: { ...MAP_SIZES[size], generator: 'gen.caves' } };
        const w = makeWorld(opts);
        expect(w.hash()).toBe(makeWorld(opts).hash());
        expect(w.quiet).toBe(true);
        const g = w.grid;
        const lime = w.mats.cellOf('material.limestone');
        let roofed = 0;
        for (const t of w.tanks) {
          // ground right under the treads, and at least 60 rows of air above
          expect(g.material[t.y * g.width + t.x]).not.toBe(0);
          for (let y = t.y - 60; y < t.y; y++) {
            for (let x = t.x - t.half; x < t.x + t.half; x++) {
              expect(g.material[y * g.width + x]).toBe(0);
            }
          }
          if (g.surfaceY(t.x) < t.y) roofed++;
        }
        // no skylight opens straight over a tank
        expect(roofed).toBe(players);
        let stone = 0;
        for (const c of g.material) if (c === lime) stone++;
        expect(stone).toBeGreaterThan(g.width * 10);
      }
    }
  });

  it('keeps its roof up after a blast, with no dirt left hanging to fall', () => {
    const w = makeWorld({
      seed: 4,
      players: 2,
      map: { ...MAP_SIZES.small, generator: 'gen.caves' },
      rules: { turnTimer: 0, suddenDeath: false },
    });
    const g = w.grid;
    const x = 400;
    let y = 0;
    while (y < g.height && g.material[y * g.width + x] !== 0) y++;
    const lime = w.mats.cellOf('material.limestone');
    const before = g.material.filter((c) => c === lime).length;
    for (let dx = -8; dx <= 8; dx++) for (let dy = -10; dy <= 0; dy++) g.set(x + dx, y + dy, 0);
    g.markDirty(x - 9, y - 11, x + 9, y + 1);
    for (let i = 0; i < 600 && !w.quiet; i++) w.step();
    expect(w.quiet).toBe(true);
    const after = g.material.filter((c) => c === lime).length;
    expect(after).toBeGreaterThan(before - 17 * 11 - 1);
    expect(after).toBeLessThan(before);
  });
});
