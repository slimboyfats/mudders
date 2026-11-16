import { describe, expect, it } from 'vitest';
import type { World } from '@mudders/sim';
import { countCells, dropAt, flatWorld, passTurns } from './testing';

/**
 * Tank stains (§4b, NOITA-FEEL proposal 6): the mode's `stains` rules on `mode.classic`, and the
 * materials' `stain` fields.
 */

/** Turn the ground row under a tank into `material` for a few ticks (a stain pass), then dirt again. */
function touch(w: World, player: number, material: string): void {
  const g = w.grid;
  const t = w.tanks[player]!;
  const c = w.mats.cellOf(material);
  const dirt = w.mats.cellOf('material.dirt');
  for (let x = t.x - t.half; x < t.x + t.half; x++) g.set(x, t.y, c);
  w.run(8);
  for (let x = t.x - t.half; x < t.x + t.half; x++) g.set(x, t.y, dirt);
  g.markDirty(t.x - t.half, t.y, t.x + t.half, t.y);
}

describe('tank stains', () => {
  it('materials carry their stains', () => {
    const w = flatWorld();
    const r = w.mode.stains;
    expect(r.wet.shock).toBe(50);
    expect(r.oiled).toEqual({ heat: 50, burn: 1 });
    expect(r.muddy.fuel).toBe(50);
    expect(r.burning).toEqual({ damage: 5, fire: 'material.fire' });
    expect(w.mats.anyStain).toBe(true);
  });

  it('water wets a tank for 2 of its own turns, and it dries off after them', () => {
    const w = flatWorld();
    const t = w.tanks[1]!;
    touch(w, 1, 'material.water');
    expect(t.wet).toBe(2);
    expect(w.snapshot().entities.some((e) => e.kind === 'tank' && e.wet === 2)).toBe(true);
    passTurns(w, 2);
    expect(t.wet).toBe(1);
    passTurns(w, 2);
    expect(t.wet).toBe(0);
  });

  it('the tank whose turn it is keeps its stain through the turn ending now', () => {
    const w = flatWorld();
    touch(w, 0, 'material.water');
    expect(w.tanks[0]!.wet).toBe(3);
    passTurns(w, 1);
    expect(w.tanks[0]!.wet).toBe(2);
  });

  it('a wet tank takes half again as much shock damage, and nothing else changes', () => {
    const w = flatWorld();
    const t = w.tanks[1]!;
    touch(w, 1, 'material.water');
    let hp = t.health;
    w.hurt(1, 20, 0, 'shock');
    expect(hp - t.health).toBe(30);
    hp = t.health;
    w.hurt(1, 20, 0, 'heat');
    expect(hp - t.health).toBe(20);
    hp = t.health;
    w.hurt(1, 20, 0);
    expect(hp - t.health).toBe(20);
  });

  it('terrainop.conduct shocks a tank standing in the water harder (it is wet)', () => {
    const w = flatWorld(150, { tankColumns: [40, 300] });
    const water = w.mats.cellOf('material.water');
    for (let x = 150; x < 330; x++) for (let y = 150; y < 158; y++) w.grid.set(x, y, water);
    w.grid.markDirty(150, 140, 330, 160);
    const t = w.tanks[1]!;
    t.y = 157;
    w.run(60);
    expect(t.wet).toBeGreaterThan(0);
    const hp = t.health;
    dropAt(w, 'weapon.thunderstorm-bolt', 170);
    // conduct's 30, half again for the wet hull
    expect(hp - t.health).toBe(45);
  });

  it('a wet tank does not catch fire, and water puts a burning tank out', () => {
    const w = flatWorld();
    const t = w.tanks[1]!;
    touch(w, 1, 'material.water');
    touch(w, 1, 'material.fire');
    expect(t.burning).toBe(0);
    const v = flatWorld();
    const u = v.tanks[1]!;
    touch(v, 1, 'material.fire');
    expect(u.burning).toBe(2);
    touch(v, 1, 'material.water');
    expect(u.burning).toBe(0);
    expect(v.snapshot().effectEvents.some((e) => e.type === 'unstained')).toBe(true);
  });

  it('oil makes heat hit half again as hard, and a burn last a turn longer', () => {
    const w = flatWorld();
    const t = w.tanks[1]!;
    touch(w, 1, 'material.oil');
    expect(t.oiled).toBe(2);
    const hp = t.health;
    w.hurt(1, 20, 0, 'heat');
    expect(hp - t.health).toBe(30);
    touch(w, 1, 'material.fire');
    expect(t.burning).toBe(3);
    // burning oil does both at once
    const v = flatWorld();
    touch(v, 1, 'material.burning-oil');
    expect(v.tanks[1]!.oiled).toBe(2);
    expect(v.tanks[1]!.burning).toBe(3);
  });

  it('mud and liquid dirt make driving burn half again as much fuel', () => {
    const w = flatWorld();
    const t = w.tanks[0]!;
    const base = w.fuelPerCell(t);
    touch(w, 0, 'material.liquid-dirt');
    expect(t.muddy).toBe(3);
    expect(t.wet).toBe(0);
    expect(w.fuelPerCell(t)).toBe(Math.trunc((base * 150) / 100));
    const f0 = t.fuel;
    const x0 = t.x;
    w.applyInput(0, { type: 'drive', dir: 1 });
    for (let i = 0; i < 31; i++) w.step();
    w.applyInput(0, { type: 'drive', dir: 0 });
    w.step();
    const cells = t.x - x0;
    expect(cells).toBeGreaterThan(4);
    expect(f0 - t.fuel).toBe(Math.trunc((cells * w.fuelPerCell(t)) / 1000));
    // mud is both wet and muddy
    const v = flatWorld();
    touch(v, 1, 'material.mud');
    expect(v.tanks[1]!.muddy).toBe(2);
    expect(v.tanks[1]!.wet).toBe(2);
  });

  it('a burning tank loses health and sets fire beside itself at the end of its own turns', () => {
    const w = flatWorld();
    const t = w.tanks[1]!;
    touch(w, 1, 'material.fire');
    expect(t.burning).toBe(2);
    const hp = t.health;
    passTurns(w, 1);
    // not its own turn: no burn yet
    expect(t.health).toBe(hp);
    expect(countCells(w, 'material.fire')).toBe(0);
    w.tanks[1]!.inventory.fill(0);
    passTurns(w, 1);
    expect(t.burning).toBe(1);
    expect(hp - t.health).toBeGreaterThanOrEqual(5);
    expect(w.snapshot().effectEvents.some((e) => e.type === 'burn')).toBe(true);
    expect(countCells(w, 'material.fire') + countCells(w, 'material.ash')).toBeGreaterThan(0);
    passTurns(w, 2);
    expect(t.burning).toBe(0);
  });

  it('stains are hashed while set', () => {
    const w = flatWorld();
    const v = flatWorld();
    expect(w.hash()).toBe(v.hash());
    for (const k of ['wet', 'oiled', 'muddy', 'burning'] as const) {
      w.tanks[1]![k] = 1;
      expect(w.hash()).not.toBe(v.hash());
      w.tanks[1]![k] = 0;
      expect(w.hash()).toBe(v.hash());
    }
  });
});
