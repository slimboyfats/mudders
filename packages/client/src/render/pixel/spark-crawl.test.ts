import { describe, expect, it } from 'vitest';
import { FxRng } from './gl';
import { crawlLife, crawlPath } from './spark-crawl';

/** A 40×20 map: an L-shaped steel girder (cell 100) in dirt (cell 1), the rest air. */
function girder(x: number, y: number): number {
  if (y === 15 && x >= 5 && x < 35) return 100;
  if (x === 34 && y >= 3 && y <= 15) return 100;
  return y > 15 ? 1 : 0;
}

describe('spark crawl', () => {
  it('runs only through the charged material, one 4-joined whole cell at a time', () => {
    for (let seed = 1; seed < 20; seed++) {
      const p = crawlPath(girder, 40, 20, 10, 15, 100, 40, new FxRng(seed));
      expect(p.length).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < p.length; i += 2) {
        expect(girder(p[i]!, p[i + 1]!)).toBe(100);
        expect(Number.isInteger(p[i])).toBe(true);
        if (i >= 2) expect(Math.abs(p[i]! - p[i - 2]!) + Math.abs(p[i + 1]! - p[i - 1]!)).toBe(1);
      }
    }
  });

  it('follows the girder round its corner', () => {
    const p = crawlPath(girder, 40, 20, 30, 15, 100, 40, new FxRng(3));
    let up = false;
    for (let i = 1; i < p.length; i += 2) if (p[i]! < 10) up = true;
    // from x 30 the spark runs into the corner and up the column, or back along the beam
    expect(up || p[p.length - 2]! < 30).toBe(true);
    expect(crawlLife(p)).toBeGreaterThan(p.length / 4);
  });

  it('starts nowhere off the conductor', () => {
    expect(crawlPath(girder, 40, 20, 10, 2, 100, 40, new FxRng(1))).toHaveLength(0);
  });
});
