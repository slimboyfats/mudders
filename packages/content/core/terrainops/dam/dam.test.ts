import type { World } from '@mudders/sim';
import { describe, expect, it } from 'vitest';
import { countCells, makeWorld } from '../../../src/testing';

const hills = (mapEvents: boolean, seed = 17): World =>
  makeWorld({
    seed,
    players: 2,
    map: { generator: 'gen.hills', width: 800, height: 400 },
    tankColumns: [100, 700],
    wind: 0,
    rules: { turnTimer: 0, suddenDeath: false, mapEvents },
  });

/** Where the dam stands: its middle column and its top row (no dam: null). */
function damOf(w: World): { x: number; y: number } | null {
  const g = w.grid;
  const concrete = w.mats.cellOf('material.concrete');
  let n = 0;
  let sx = 0;
  let top = g.height;
  for (let i = 0; i < g.material.length; i++) {
    if (g.material[i] !== concrete) continue;
    n++;
    sx += i % g.width;
    top = Math.min(top, Math.floor(i / g.width));
  }
  return n > 0 ? { x: Math.round(sx / n), y: top } : null;
}

/** Water cells on each side of column x. */
function waterSides(w: World, x: number): [number, number] {
  const g = w.grid;
  const water = w.mats.cellOf('material.water');
  let l = 0;
  let r = 0;
  for (let i = 0; i < g.material.length; i++) {
    if (g.material[i] !== water) continue;
    if (i % g.width < x) l++;
    else r++;
  }
  return [l, r];
}

describe('terrainop.dam', () => {
  it('builds a concrete dam with a still lake behind it, clear of the tanks', () => {
    const w = hills(true);
    const d = damOf(w)!;
    expect(d).not.toBeNull();
    for (const t of w.tanks) expect(Math.abs(t.x - d.x)).toBeGreaterThan(24);
    expect(countCells(w, 'material.concrete')).toBeGreaterThan(150);
    const water = countCells(w, 'material.water');
    expect(water).toBeGreaterThan(500);
    w.run(300);
    expect(countCells(w, 'material.water')).toBe(water);
  });

  it('stays off without the rule, so other matches keep their results', () => {
    const w = hills(false);
    expect(damOf(w)).toBeNull();
    expect(countCells(w, 'material.water')).toBe(0);
  });

  it('lets the lake out downstream when a blast breaks the wall', () => {
    const w = hills(true);
    const d = damOf(w)!;
    const before = waterSides(w, d.x);
    const lakeLeft = before[0] > before[1];
    const g = w.grid;
    // blow a hole through the wall below the water line, from the dry side
    const cx = d.x + (lakeLeft ? 6 : -6);
    w.projectiles.push({
      id: 900,
      weapon: w.weaponByIndex('weapon.missile'),
      owner: 0,
      x: cx * 65536,
      y: (d.y + 14) * 65536,
      vx: 0,
      vy: 65536,
      age: 10,
      alive: true,
      data: [],
    });
    w.phase = 'resolve';
    w.run(900);
    const after = waterSides(w, d.x);
    const out = lakeLeft ? after[1] - before[1] : after[0] - before[0];
    expect(g.width).toBe(800);
    expect(out).toBeGreaterThan(200);
  });

  it('is deterministic', () => {
    expect(hills(true).hash()).toBe(hills(true).hash());
  });
});
