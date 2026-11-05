import { describe, expect, it } from 'vitest';
import { Prng } from './prng';

describe('Prng', () => {
  it('is reproducible from a seed and pinned to known values', () => {
    const a = new Prng(42);
    const b = new Prng(42);
    const seq = Array.from({ length: 5 }, () => a.nextU32());
    expect(Array.from({ length: 5 }, () => b.nextU32())).toEqual(seq);
    // Golden: changing the generator changes every replay, so it must be deliberate.
    expect(seq).toMatchInlineSnapshot(`
      [
        3825871779,
        1851418855,
        1383259262,
        890322987,
        2796912455,
      ]
    `);
  });

  it('differs across seeds', () => {
    expect(new Prng(1).nextU32()).not.toBe(new Prng(2).nextU32());
  });

  it('int/range/chance stay in bounds and cover the range', () => {
    const r = new Prng(7);
    const seen = new Array<number>(10).fill(0);
    for (let i = 0; i < 5000; i++) {
      const v = r.int(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      seen[v]!++;
      const w = r.range(-3, 3);
      expect(w).toBeGreaterThanOrEqual(-3);
      expect(w).toBeLessThanOrEqual(3);
    }
    for (const n of seen) expect(n).toBeGreaterThan(400);
    let yes = 0;
    for (let i = 0; i < 4000; i++) if (r.chance(1, 4)) yes++;
    expect(yes).toBeGreaterThan(850);
    expect(yes).toBeLessThan(1150);
  });

  it('shuffle is a permutation', () => {
    const arr = new Prng(3).shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([...arr].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
