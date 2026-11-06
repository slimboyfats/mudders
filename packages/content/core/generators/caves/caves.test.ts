import { describe, expect, it } from 'vitest';
import { MAP_SIZES } from '@mudders/shared';
import { launchAt, makeWorld } from '../../../src/testing';

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

  it('keeps its roof up after a blast but drops a stalactite cut through as dirt', () => {
    const w = makeWorld({
      seed: 4,
      players: 2,
      map: { ...MAP_SIZES.medium, generator: 'gen.caves' },
      rules: { turnTimer: 0, suddenDeath: false },
    });
    const g = w.grid;
    const W = g.width;
    const lime = w.mats.cellOf('material.limestone');
    const dirt = w.mats.cellOf('material.dirt');
    // the limestone is one glued group; nothing hangs loose at the start
    expect(w.groups.count).toBe(1);
    expect(w.groups.isLocal(1)).toBe(true);
    expect(w.quiet).toBe(true);
    // the longest stalactite: the column whose roof reaches lowest (not a pillar)
    const under = (x: number) => {
      let y = 0;
      while (y < g.height && g.material[y * W + x] !== 0) y++;
      return y;
    };
    let best = -1;
    let tip = 0;
    for (let x = 20; x < W - 20; x++) {
      const y = under(x);
      if (y < g.height * 0.5 && y > tip && g.material[(y - 1) * W + x] === lime) {
        tip = y;
        best = x;
      }
    }
    expect(best).toBeGreaterThan(0);
    let root = tip;
    while (under(best - 14) < root && under(best + 14) < root && root > 0) root--;
    const count = (m: number) => g.material.filter((c) => c === m).length;
    const lime0 = count(lime);
    const dirt0 = count(dirt);
    // a baby missile flying sideways through the stalactite just under the roof
    const cut = Math.min(tip - 6, root + 10);
    launchAt(w, 'weapon.baby-missile', best - 40, cut, 6, 0);
    for (let i = 0; i < 3000 && !w.quiet; i++) w.step();
    expect(w.quiet).toBe(true);
    // nothing of the stalactite is left hanging below the cut, and the roof is still up
    for (let y = cut + 8; y < tip; y++) expect(g.material[y * W + best]).not.toBe(lime);
    expect(count(lime)).toBeGreaterThan(lime0 * 0.9);
    expect(count(lime)).toBeLessThan(lime0);
    expect(count(dirt)).toBeGreaterThan(dirt0);
  });
});
