import { describe, expect, it } from 'vitest';
import { TANK_H, TANK_HALF } from '@mudders/sim';
import { dropAt, groupCells, makeWorld, propWorld } from '../../../src/testing';

describe('prop.rock-arch', () => {
  it('starts a tank spawned under it on the ground beneath, not on top', () => {
    const w = makeWorld({
      map: { width: 400, height: 200 },
      tankColumns: [200, 360],
      props: [{ prop: 'prop.rock-arch', x: 200 }],
      wind: 0,
    });
    const t = w.tanks[0]!;
    const g = w.grid;
    expect(groupCells(w)).toBeGreaterThan(800);
    // rock overhead, open air around the tank's body, ground underfoot
    let roof = 0;
    for (let y = 0; y < t.y - TANK_H; y++) if (g.group[y * g.width + t.x] !== 0) roof++;
    expect(roof).toBeGreaterThan(5);
    for (let x = t.x - TANK_HALF; x < t.x + TANK_HALF; x++) {
      for (let y = t.y - TANK_H; y < t.y; y++) expect(g.material[y * g.width + x]).toBe(0);
    }
    expect(g.material[t.y * g.width + t.x]).not.toBe(0);
  });

  it('shields the tank and the ground under it from a blast on the roof', () => {
    const w = propWorld('prop.rock-arch', 200, 150, { tankColumns: [200, 360] });
    const t = w.tanks[0]!;
    const g = w.grid;
    const ground = (): number => {
      let n = 0;
      for (let x = 180; x < 220; x++)
        for (let y = 150; y < 175; y++) if (g.material[y * g.width + x]) n++;
      return n;
    };
    const before = ground();
    dropAt(w, 'weapon.missile', 200);
    expect(ground()).toBe(before);
    expect(t.health).toBe(100);
  });

  it('chips where it is hit, and a piece cut off from the ground falls on the tank', () => {
    const w = propWorld('prop.rock-arch', 200, 150, { tankColumns: [200, 360] });
    const t = w.tanks[0]!;
    t.health = 100_000;
    const before = groupCells(w);
    dropAt(w, 'weapon.baby-missile', 200);
    // the rock around the hit came loose, the rest still holds
    const after = groupCells(w);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(before / 2);
    expect(w.groups.broken[1]).toBe(0);
    // cut the roof off its supports
    for (const x of [180, 220, 180, 220]) dropAt(w, 'weapon.missile', x);
    w.run(600);
    expect(w.quiet).toBe(true);
    const g = w.grid;
    const rubble = w.mats.cellOf('material.rubble');
    let over = 0;
    for (let x = t.x - TANK_HALF; x < t.x + TANK_HALF; x++) {
      for (let y = t.y - TANK_H; y < t.y; y++) if (g.material[y * g.width + x] === rubble) over++;
    }
    // the roof comes down on the tank (much of it lands beside)
    expect(over).toBeGreaterThan(TANK_HALF * 2);
    expect(groupCells(w)).toBeLessThan(after);
  });

  it('always leaves room for a tank, whichever way it faces', () => {
    for (const seed of [1, 2, 3, 4]) {
      const w = makeWorld({
        seed,
        map: { width: 400, height: 200 },
        tankColumns: [200, 360],
        props: [{ prop: 'prop.rock-arch', x: 200 }],
      });
      const t = w.tanks[0]!;
      for (let x = t.x - TANK_HALF; x < t.x + TANK_HALF; x++) {
        for (let y = t.y - TANK_H; y < t.y; y++)
          expect(w.grid.material[y * w.grid.width + x]).toBe(0);
      }
    }
  });
});
