import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { countCells, effectsOf, propWorld } from '../../../src/testing';

/** Fire a shell flat from the left into row y, then run `ticks`. */
function shootAcross(w: World, weapon: string, x: number, y: number, ticks: number): void {
  w.projectiles.push({
    id: 900,
    weapon: w.weaponByIndex(weapon),
    owner: 0,
    x: x * 65536,
    y: y * 65536,
    vx: 4 * 65536,
    vy: 0,
    age: 10,
    alive: true,
    data: [],
  });
  w.phase = 'resolve';
  w.run(ticks);
}

/** Leftmost and rightmost columns holding steel. */
function steelSpan(w: World): [number, number] {
  const g = w.grid;
  const steel = w.mats.cellOf('material.steel');
  let a = g.width;
  let b = -1;
  for (let i = 0; i < g.material.length; i++) {
    if (g.material[i] !== steel) continue;
    const x = i % g.width;
    if (x < a) a = x;
    if (x > b) b = x;
  }
  return [a, b];
}

describe('prop.power-pylon', () => {
  it('stands as two lattice pylons with lines between them and a sealed transformer', () => {
    const w = propWorld('prop.power-pylon', 200);
    expect(countCells(w, 'material.transformer')).toBeGreaterThan(20);
    const [a, b] = steelSpan(w);
    expect(b - a).toBeGreaterThan(70);
    w.run(200);
    expect(effectsOf(w, 'pocketBurst')).toHaveLength(0);
    expect(w.quiet).toBe(true);
  });

  it('shorts out when the transformer box is hit, shocking a tank leaning on the far pylon', () => {
    const w = propWorld('prop.power-pylon', 200);
    const [, b] = steelSpan(w);
    const t = w.tanks[1]!;
    t.x = b + 3;
    const before = t.health;
    shootAcross(w, 'weapon.baby-missile', 152, 150 - 46 + 33, 300);
    expect(countCells(w, 'material.transformer')).toBe(0);
    expect(t.health).toBeLessThan(before);
  });
});
