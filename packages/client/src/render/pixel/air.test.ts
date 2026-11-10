import { describe, expect, it } from 'vitest';
import { PixelAir } from './air';
import { PKind, type Emit } from './particles';

const TONES = [1, 2, 3, 4] as const;

function cells(mult: number, solid: (x: number, y: number) => boolean, ticks = 60): Emit[] {
  const out: Emit[] = [];
  const air = new PixelAir(null, { add: (e) => out.push(e) }, mult);
  for (let t = 0; t < ticks; t++) air.cloud([100, 80, 120, 82], 10, 1, TONES, solid);
  return out;
}

describe('PixelAir', () => {
  it('keeps a gas cloud filled with single gas cells around its puffs', () => {
    const out = cells(1, () => false);
    expect(out.length).toBeGreaterThan(100);
    for (const e of out) {
      expect(e.kind).toBe(PKind.Gas);
      expect(e.size).toBe(1);
      expect(TONES).toContain(e.color);
      expect(e.x).toBeGreaterThan(100 - 12);
      expect(e.x).toBeLessThan(120 + 12);
    }
    // the same splats give the same pixels
    expect(cells(1, () => false)).toEqual(out);
  });

  it('spawns nothing inside the ground and fewer cells at low quality', () => {
    expect(cells(1, () => true)).toEqual([]);
    const ground = cells(1, (_x, y) => y >= 80);
    expect(ground.length).toBeGreaterThan(0);
    for (const e of ground) expect(Math.floor(e.y)).toBeLessThan(80);
    expect(cells(0.35, () => false).length).toBeLessThan(cells(1, () => false).length * 0.5);
  });

  it('turns gas dye into gas cells and soot into wisps', () => {
    const out: Emit[] = [];
    const air = new PixelAir(null, { add: (e) => out.push(e) }, 1);
    air.splat(50, 50, 8, 0, 0, 0, 0, 2);
    expect(out.length).toBeGreaterThan(10);
    expect(out.every((e) => e.kind === PKind.Gas)).toBe(true);
    out.length = 0;
    air.splat(50, 50, 8, 0, 0, 1, 0);
    expect(out.length).toBeGreaterThan(10);
    expect(out.every((e) => e.kind === PKind.Wisp)).toBe(true);
  });
});
