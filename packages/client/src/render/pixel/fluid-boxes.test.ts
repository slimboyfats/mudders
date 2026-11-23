import { describe, expect, it } from 'vitest';
import { activeBoxes, tileSize } from './fluid';

function boxes(rows: string[]): { n: number; out: number[]; cover: string[] } {
  const th = rows.length;
  const tw = rows[0]!.length;
  const hold = new Uint8Array(tw * th);
  rows.forEach((r, y) => [...r].forEach((c, x) => (hold[y * tw + x] = c === '#' ? 3 : 0)));
  const cover = new Uint8Array(tw * th);
  const out: number[] = [];
  const n = activeBoxes(hold, tw, th, cover, out);
  const pic = rows.map((_, y) =>
    Array.from(cover.subarray(y * tw, (y + 1) * tw), (v) => (v ? 'o' : '.')).join(''),
  );
  return { n, out: out.slice(0, n * 4), cover: pic };
}

describe('activeBoxes', () => {
  it('is empty when no tile is in use', () => {
    expect(boxes(['....', '....']).n).toBe(0);
  });

  it('puts a ring of one tile around what is in use', () => {
    const b = boxes(['........', '........', '...#....', '........', '........']);
    expect(b.n).toBe(1);
    expect(b.out).toEqual([2, 1, 5, 4]);
    expect(b.cover).toEqual(['........', '..ooo...', '..ooo...', '..ooo...', '........']);
  });

  it('keeps places far apart in boxes of their own', () => {
    const b = boxes(['#.........', '..........', '.........#']);
    expect(b.n).toBe(2);
    expect(b.out).toEqual([0, 0, 2, 2, 8, 1, 10, 3]);
  });

  it('covers every tile in use and its neighbours, whatever the pattern', () => {
    let seed = 7;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    for (let round = 0; round < 300; round++) {
      const tw = 25;
      const th = 13;
      const hold = new Uint8Array(tw * th);
      const k = Math.floor(rnd() * 12);
      for (let i = 0; i < k; i++) hold[Math.floor(rnd() * tw * th)] = 1;
      const cover = new Uint8Array(tw * th);
      const out: number[] = [];
      const n = activeBoxes(hold, tw, th, cover, out);
      expect(n).toBeLessThanOrEqual(4);
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          if (hold[y * tw + x] === 0) continue;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= tw || yy >= th) continue;
              expect(cover[yy * tw + xx]).toBe(1);
            }
          }
        }
      }
      // boxes never overlap: a cell written twice in one pass would still be right, but wasted
      let area = 0;
      for (let i = 0; i < n; i++)
        area += (out[i * 4 + 2]! - out[i * 4]!) * (out[i * 4 + 3]! - out[i * 4 + 1]!);
      expect(area).toBe(cover.reduce((a, v) => a + v, 0));
    }
  });

  it('uses tiles of 64 map cells at high quality', () => {
    expect(tileSize(1)).toBe(64);
    expect(tileSize(2)).toBe(32);
  });
});
