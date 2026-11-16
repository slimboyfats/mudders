import { describe, expect, it } from 'vitest';
import { countCells, dropAt, flatWorld } from '../../../src/testing';

describe('weapon.oil-flask', () => {
  it('oils a small patch around the hit, which a fire shot then sets burning', () => {
    const w = flatWorld();
    const dirt = countCells(w, 'material.dirt');
    dropAt(w, 'weapon.oil-flask', 200);
    const oil = w.mats.cellOf('material.oil');
    const g = w.grid;
    let n = 0;
    let lo = g.width;
    let hi = 0;
    for (let i = 0; i < g.coating.length; i++) {
      if (g.coating[i] !== oil) continue;
      n++;
      const x = i % g.width;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    // a 22-cell slick three cells deep: smaller than an Oil Slick's
    expect(n).toBeGreaterThan(80);
    expect(n).toBeLessThan(200);
    expect(lo).toBeGreaterThanOrEqual(200 - 23);
    expect(hi).toBeLessThanOrEqual(200 + 23);
    // the smash itself digs nothing and hurts nobody
    expect(countCells(w, 'material.dirt')).toBe(dirt);
    expect(w.tanks.every((t) => t.health === 100)).toBe(true);
    // the follow-up: a fire shot burns the slick away
    dropAt(w, 'weapon.incendiary', 200);
    const left = g.coating.reduce((k, c) => k + (c === oil ? 1 : 0), 0);
    expect(left).toBeLessThan(n / 2);
  });
});
