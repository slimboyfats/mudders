import { describe, expect, it } from 'vitest';
import { flatten, makeWorld } from '../../../src/testing';

/** A V-shaped valley of `materialId` with its floor at x = 300; tank 0 parked on the left slope. */
function valley(materialId: string) {
  const w = makeWorld({ map: { width: 600, height: 300 }, tankColumns: [200, 560] });
  flatten(w, 250);
  const g = w.grid;
  const cell = w.mats.cellOf(materialId);
  for (let x = 0; x < g.width; x++) {
    const top = 150 + Math.min(100, Math.abs(x - 300) < 20 ? 100 : 100 - (Math.abs(x - 300) - 20));
    for (let y = Math.max(0, top); y < 250; y++) g.material[y * g.width + x] = cell;
  }
  const t = w.tanks[0]!;
  t.y = g.surfaceY(t.x - 7);
  return w;
}

function run(w: ReturnType<typeof valley>, ticks: number) {
  for (let i = 0; i < ticks; i++) w.step();
}

describe('material.frost', () => {
  it('tanks slide down frosted slopes to level ground, and the shot waits for them', () => {
    const w = valley('material.frost');
    const t = w.tanks[0]!;
    const x0 = t.x;
    expect(w.quiet).toBe(false);
    run(w, 600);
    expect(t.x).toBeGreaterThan(x0 + 40);
    expect(Math.abs(t.x - 300)).toBeLessThan(20);
    expect(w.quiet).toBe(true);
    const settled = t.x;
    run(w, 100);
    expect(t.x).toBe(settled);
  });

  it('plain dirt slopes hold the tank in place', () => {
    const w = valley('material.packed-mud');
    const t = w.tanks[0]!;
    const x0 = t.x;
    run(w, 300);
    expect(Math.abs(t.x - x0)).toBeLessThan(3);
  });
});
