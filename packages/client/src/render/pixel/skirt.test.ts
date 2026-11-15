import { describe, expect, it } from 'vitest';
import { BlastSkirts, surfaceNear, type SkirtGround } from './skirt';
import { PKind, type Emit } from './particles';

/** Flat ground on row 100, with a wall rising from x = 300. */
const ground: SkirtGround = {
  width: 400,
  height: 200,
  solid: (x, y) => y >= 100 || (x >= 300 && y >= 40),
  dust: () => 0x806040,
};

function run(radius: number, x = 200, y = 96, ticks = 120): Emit[] {
  const out: Emit[] = [];
  const s = new BlastSkirts();
  s.blast(x, y, radius, 1, 0, ground);
  for (let t = 0; t < ticks; t++) s.tick(t, ground, { add: (e) => out.push(e) }, 1);
  return out;
}

describe('blast skirts', () => {
  it('finds the surface under a point', () => {
    expect(surfaceNear(ground, 10, 90, 4, 20)).toBe(100);
    expect(surfaceNear(ground, 10, 104, 8, 20)).toBe(100);
    expect(surfaceNear(ground, 310, 90, 4, 20)).toBe(40);
  });

  it('runs dust out along the ground both ways from a big blast', () => {
    const dust = run(24).filter((e) => e.kind === PKind.Dust);
    expect(dust.length).toBeGreaterThan(20);
    const xs = dust.map((e) => e.x);
    expect(Math.min(...xs)).toBeLessThan(200 - 40);
    expect(Math.max(...xs)).toBeGreaterThan(200 + 40);
    for (const e of dust) expect(e.y).toBeLessThan(100);
  });

  it('stops at a wall it cannot climb', () => {
    const dust = run(20, 260).filter((e) => e.kind === PKind.Dust);
    expect(dust.every((e) => e.x < 301)).toBe(true);
  });

  it('raises nothing for small blasts or airbursts', () => {
    expect(run(6)).toHaveLength(0);
    expect(run(24, 200, 20)).toHaveLength(0);
  });
});
